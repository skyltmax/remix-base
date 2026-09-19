import { type Request } from "express"
import { isbot } from "isbot"

// Predicate for `deviceKeyMiddleware`'s `skip` option and any other bot-conditional branch.
export const isBotRequest = (req: Request): boolean => isbot(req.headers["user-agent"])
