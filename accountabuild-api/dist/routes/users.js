"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
/* GET users listing. */
router.get('/', auth_1.protect, function (req, res) {
    // Thanks to the middleware, we know req.user exists.
    res.json({
        message: 'This is a protected resource for authenticated users.',
        user: req.user
    });
});
exports.default = router;
