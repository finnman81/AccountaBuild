import express, { Request, Response } from 'express';
import { protect } from '../middleware/auth';
const router = express.Router();

/* GET users listing. */
router.get('/', protect, function (req: Request, res: Response) {
  // Thanks to the middleware, we know req.user exists.
  res.json({
    message: 'This is a protected resource for authenticated users.',
    user: req.user
  });
});

export default router;
