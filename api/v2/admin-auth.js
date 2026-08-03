/* ==========================================================================
   MIVAPULSE v2 - ADMIN AUTH API (Vercel Serverless Compatible)
   ========================================================================== */

import crypto from 'crypto';

const JWT_SECRET = process.env.MIVAPULSE_JWT_SECRET || 'mivapulse-dev-secret-change-in-production';

// In-Memory fallback store for Vercel Serverless (Read-only filesystem)
const DEFAULT_USERS = [{
    id: 'admin_001',
    username: 'admin',
    passwordHash: crypto.createHash('sha256').update('admin123' + 'mivapulse_salt').digest('hex'),
    role: 'SuperAdmin',
    permissions: ['*'],
    createdAt: new Date().toISOString()
}];

// Dynamic user memory store to prevent fs read/write crashes on serverless
let inMemoryUsers = [...DEFAULT_USERS];

function loadUsers() {
    return inMemoryUsers;
}

function saveUsers(users) {
    inMemoryUsers = users;
}

function hashPw(pw) {
    return crypto.createHash('sha256').update(pw + 'mivapulse_salt').digest('hex');
}

function createToken(user) {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({
        sub: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400
    })).toString('base64url');
    const s = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
    return `${h}.${p}.${s}`;
}

function verifyToken(token) {
    try {
        const [h, p, s] = token.split('.');
        const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
        if (s !== expected) return null;
        const data = JSON.parse(Buffer.from(p, 'base64url').toString());
        if (data.exp < Math.floor(Date.now() / 1000)) return null;
        return data;
    } catch (e) {
        return null;
    }
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Parse URL to remove query parameters safely
    const urlObj = new URL(req.url, 'http://localhost');
    const urlPath = urlObj.pathname;
    const body = req.body || {};

    console.log('Admin Auth API called:', req.method, urlPath);

    // ── LOGIN ──
    if (urlPath.endsWith('/login') && req.method === 'POST') {
        console.log('Login attempt for:', body.username);
        const users = loadUsers();
        const user = users.find(u => u.username === body.username);
        
        if (!user || user.passwordHash !== hashPw(body.password || '')) {
            console.log('Login failed: invalid credentials');
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = createToken(user);
        console.log('Login successful for:', user.username);
        return res.status(200).json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                permissions: user.permissions
            }
        });
    }

    // ── LIST USERS ──
    if (urlPath.endsWith('/users') && req.method === 'GET') {
        const users = loadUsers();
        const safe = users.map(u => ({
            id: u.id,
            username: u.username,
            role: u.role,
            permissions: u.permissions,
            createdAt: u.createdAt
        }));
        return res.status(200).json({ success: true, users: safe });
    }

    // ── CREATE USER ──
    if (urlPath.endsWith('/users') && req.method === 'POST') {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '');
        const decoded = verifyToken(token);
        
        if (!decoded) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!decoded.permissions.includes('*') && decoded.role !== 'SuperAdmin') {
            return res.status(403).json({ error: 'SuperAdmin access required' });
        }
        
        const users = loadUsers();
        if (users.find(u => u.username === body.username)) {
            return res.status(409).json({ error: 'Username already exists' });
        }
        
        const newUser = {
            id: crypto.randomUUID(),
            username: body.username,
            passwordHash: hashPw(body.password || 'changeme'),
            role: body.role || 'Viewer',
            permissions: body.permissions || ['analytics:read', 'questions:read'],
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        saveUsers(users);
        
        return res.status(201).json({
            success: true,
            user: { id: newUser.id, username: newUser.username, role: newUser.role }
        });
    }

    // ── UPDATE PASSWORD ──
    if (urlPath.endsWith('/users') && req.method === 'PUT') {
        const users = loadUsers();
        const user = users.find(u => u.id === body.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (!body.password || body.password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        
        user.passwordHash = hashPw(body.password);
        saveUsers(users);
        
        return res.status(200).json({ success: true, message: 'Password updated' });
    }

    // ── VERIFY TOKEN ──
    if (urlPath.endsWith('/verify') && req.method === 'GET') {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '');
        const decoded = verifyToken(token);
        
        if (!decoded) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        return res.status(200).json({ success: true, user: decoded });
    }

    console.log('Endpoint not found:', urlPath);
    return res.status(404).json({ error: 'Endpoint not found' });
}
