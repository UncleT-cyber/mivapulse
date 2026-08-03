/* ==========================================================================
   MIVAPULSE v2 - JWT RBAC AUTHENTICATION MIDDLEWARE
   Roles: SuperAdmin, Reviewer, Viewer
   ========================================================================== */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const USERS_PATH = path.join(__dirname, '..', '..', 'data', 'admin_users.json');
const JWT_SECRET = process.env.MIVAPULSE_JWT_SECRET || 'mivapulse-dev-secret-change-in-production';

// Default users if none exist
const DEFAULT_USERS = [
    {
        id: 'admin_001',
        username: 'admin',
        passwordHash: hashPassword('admin123'),
        role: 'SuperAdmin',
        permissions: ['*'],
        createdAt: new Date().toISOString()
    }
];

function hashPassword(pw) {
    return crypto.createHash('sha256').update(pw + 'mivapulse_salt').digest('hex');
}

function ensureUsersFile() {
    try {
        if (!fs.existsSync(USERS_PATH)) {
            const dir = path.dirname(USERS_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(USERS_PATH, JSON.stringify(DEFAULT_USERS, null, 2));
        }
    } catch (err) {
        console.error('Users file init error:', err);
    }
}

function getUsers() {
    ensureUsersFile();
    try {
        return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
    } catch { return DEFAULT_USERS; }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
}

// Simple JWT implementation (no external deps)
function createToken(user) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        sub: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 // 24h
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
    try {
        const [header, payload, signature] = token.split('.');
        const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
        if (signature !== expectedSig) return null;
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
        return data;
    } catch { return null; }
}

// Role permissions matrix
const ROLE_PERMISSIONS = {
    SuperAdmin: ['*'],
    Reviewer: ['review:read', 'review:approve', 'review:reject', 'review:edit', 'questions:read'],
    Viewer: ['analytics:read', 'questions:read']
};

function hasPermission(userPerms, required) {
    if (!userPerms || userPerms.includes('*')) return true;
    if (Array.isArray(required)) return required.some(r => userPerms.includes(r));
    return userPerms.includes(required);
}

// Middleware: authenticate JWT
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = decoded;
    next();
}

// Middleware: require specific permission
function requirePermission(...perms) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
        if (!hasPermission(req.user.permissions, perms)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

module.exports = {
    hashPassword, verifyToken, createToken,
    getUsers, saveUsers, ensureUsersFile,
    authenticate, requirePermission, hasPermission,
    ROLE_PERMISSIONS, JWT_SECRET
};
