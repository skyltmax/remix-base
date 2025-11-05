export default class BrowserDetection {
  static browser(userAgent: string): string {
    if (/Edg/i.test(userAgent)) {
      return "edge"
    } else if (/Opera/i.test(userAgent) || /OPR/i.test(userAgent)) {
      return "opera"
    } else if (/Firefox/i.test(userAgent)) {
      return "firefox"
    } else if (/Chrome/i.test(userAgent) || /CriOS/i.test(userAgent)) {
      return "chrome"
    } else if (/Safari/i.test(userAgent)) {
      return "safari"
    } else if (/MSIE/i.test(userAgent) || /Trident/i.test(userAgent)) {
      return "ie"
    } else {
      return "unknown"
    }
  }

  static device(userAgent: string): string {
    if (/Android/i.test(userAgent)) {
      return "android"
    } else if (/CrOS/i.test(userAgent)) {
      return "chromebook"
    } else if (/iPad/i.test(userAgent)) {
      return "ipad"
    } else if (/iPhone/i.test(userAgent)) {
      return "iphone"
    } else if (/iPod/i.test(userAgent)) {
      return "ipod"
    } else if (/Mobile/i.test(userAgent)) {
      return "mobile"
    } else if (/Macintosh/i.test(userAgent)) {
      return "mac"
    } else if (/Linux/i.test(userAgent)) {
      return "linux"
    } else if (/Windows/i.test(userAgent)) {
      return "windows"
    } else {
      return "unknown"
    }
  }

  static mobile(userAgent: string): boolean {
    return ["android", "ipad", "iphone", "ipod", "mobile"].includes(this.device(userAgent))
  }

  static os(userAgent: string): string {
    if (/Android/i.test(userAgent)) {
      return "android"
    } else if (/CrOS/i.test(userAgent)) {
      return "chromeos"
    } else if (/iPhone|iPad|iPod|Darwin/i.test(userAgent)) {
      return "ios"
    } else if (/Macintosh/i.test(userAgent)) {
      return "macos"
    } else if (/Linux/i.test(userAgent)) {
      return "linux"
    } else if (/Windows/i.test(userAgent)) {
      return "windows"
    } else {
      return "unknown"
    }
  }
}
