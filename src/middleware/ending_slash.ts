import { type RequestHandler } from "express"

// no ending slashes for SEO reasons
export const endingSlashMiddleware: RequestHandler = async (req, res, next) => {
  if (req.path.endsWith("/") && req.path.length > 1) {
    const query = req.url.slice(req.path.length)
    const safepath = req.path.slice(0, -1).replace(/\/+/g, "/")
    res.redirect(302, safepath + query)
  } else {
    next()
  }
}
