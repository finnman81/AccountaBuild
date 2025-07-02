"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const morgan_1 = __importDefault(require("morgan"));
const cors_1 = __importDefault(require("cors"));
const cors_2 = require("./config/cors");
const errorHandler_1 = __importDefault(require("./middleware/errorHandler"));
const index_1 = __importDefault(require("./routes/index"));
const users_1 = __importDefault(require("./routes/users"));
const auth_1 = __importDefault(require("./routes/auth"));
const groups_1 = __importDefault(require("./routes/groups"));
const messages_1 = __importDefault(require("./routes/messages"));
const goals_1 = __importDefault(require("./routes/goals"));
const workouts_1 = __importDefault(require("./routes/workouts"));
const app = (0, express_1.default)();
// Use CORS middleware
app.use((0, cors_1.default)(cors_2.corsOptions));
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: false }));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
app.use('/', index_1.default);
app.use('/users', users_1.default);
app.use('/auth', auth_1.default);
app.use('/groups', groups_1.default);
app.use('/messages', messages_1.default);
app.use('/goals', goals_1.default);
app.use('/workouts', workouts_1.default);
// Use the custom error handler
app.use(errorHandler_1.default);
exports.default = app;
