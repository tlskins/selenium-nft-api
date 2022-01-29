var webdriver = require('selenium-webdriver'),
chrome    = require('selenium-webdriver/chrome')
Key = webdriver.Key,
By        = webdriver.By,
until     = webdriver.until
require("chromedriver")

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function scrapeCollections(){
  var options   = new chrome.Options()
  options.addArguments('headless') // note: without dashes
  // options.addArguments('disable-gpu')
  options.addArguments('--window-size=1920,1080')
  options.addArguments('--disable-blink-features=AutomationControlled')
  options.addArguments('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36')

  let driver = await new webdriver.Builder()
  .forBrowser("chrome")
  .withCapabilities(webdriver.Capabilities.chrome()) 
  .setChromeOptions(options)
  .build()

  await scrape(driver, "https://magiceden.io/marketplace/cursed_mikes")
  sleep(500)
  await scrape(driver, "https://magiceden.io/marketplace/toadboys")

  await sleep(30000)
  await driver.quit()
}

async function scrape(driver, url) {
  try {
    await driver.get(url)

    await sleep(400) // collection-filter doesnt render immediately
    const filtersEl = await driver.findElement(By.className("collection-filter"))
    const sortSel = await filtersEl.findElement(By.className("me-dropdown-container"))
    await sortSel.click()
    const sortOpts = await filtersEl.findElements(By.className("me-select-item"))
    for(let i=0;i<sortOpts.length;i++) {
      const opt = sortOpts[i]
      const optTxt = await opt.getText()
      if ( optTxt.toLocaleLowerCase().includes("low to high")) {
        await opt.click()
      }
    }
  
    await sleep(500);
    driver.executeScript("window.scrollTo(0, document.body.scrollHeight)")
    await sleep(500)
    driver.executeScript("window.scrollTo(0, document.body.scrollHeight)")
    await sleep(500)
    driver.executeScript("window.scrollTo(0, document.body.scrollHeight)")
    await sleep(500)
  
    const els = await driver.findElements(By.className("grid-card__main"))
    for(let i=0;i<els.length;i++) {
      const el = els[i]
      const title = await el.findElement(By.className("grid-card__title")).getText()
      console.log('title: ', title)
      const tokenNum = parseInt(title.match(/#(\d+)/)[1])
      console.log('tokenNum: ', tokenNum)
      const priceStr = await el.findElement(By.className("card__price")).getText()
      const price = parseFloat(priceStr.replace(/ SOL/, ""))
      console.log('price: ', price)
      const url = await el.findElement(By.linkText(title)).getAttribute("href")
      console.log('url', url)
      const address = url.match(/item-details\/([a-zA-Z0-9]+)/)[1]
      console.log('address', address)
      const img = await el.findElement(By.className("card-img-top")).getAttribute("src")
      console.log('img', img)
    }
  } catch(error) {
    console.log(`error scraping ${url} `, error)
  }
}


scrapeCollections()