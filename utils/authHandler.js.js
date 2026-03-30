module.exports = {
    checkLogin: async function (req, res, next) {
        req.userId = req.body.userId || req.query.userId || req.headers['x-user-id'] || req.userId || null;
        next();
    },
    checkRole: function (...requiredRole) {
        return async function (req, res, next) {
            next();
        }
    }
}
