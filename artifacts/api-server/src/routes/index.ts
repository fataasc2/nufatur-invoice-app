import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nufaturRouter from "./nufatur";

const router: IRouter = Router();

router.use(healthRouter);
router.use(nufaturRouter);

export default router;
