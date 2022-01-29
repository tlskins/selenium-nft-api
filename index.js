var webdriver = require('selenium-webdriver'),
chrome    = require('selenium-webdriver/chrome')
Key = webdriver.Key,
By        = webdriver.By,
until     = webdriver.until
const { MongoClient } = require('mongodb')
require("chromedriver")
require("dotenv/config")
var moment = require("moment")


async function scrapeCollections(){
  const db = await createDb()
  const collMaps = await getCollMaps(db)
  if (!collMaps) throw Error("Collections not found")
  
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

  for (let i=0;i<collMaps.length;i++) {
    const collMap = collMaps[i]
    await scrape(db, driver, collMap)
    sleep(500)
  }

  await sleep(30000)
  await driver.quit()
}

async function scrape(db, driver, collMap) {
  console.log(`scraping ${collMap.coll}...`)
  const { coll, edenColl } = collMap
  const now = moment().format()

  try {
    const url = `${edenUrl}/${edenColl}`
    await driver.get(url)

    await sleep(1000) // collection-filter doesnt render immediately
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
    const listings = []
    let floor = 0.0
    for(let i=0;i<els.length;i++) {
      const el = els[i]
      const title = await el.findElement(By.className("grid-card__title")).getText()
      const tokenNum = parseInt(title.match(/#(\d+)/)[1])
      const priceStr = await el.findElement(By.className("card__price")).getText()
      const price = parseFloat(priceStr.replace(/ SOL/, ""))
      const url = await el.findElement(By.linkText(title)).getAttribute("href")
      const tokenAddr = url.match(/item-details\/([a-zA-Z0-9]+)/)[1]
      const img = await el.findElement(By.className("card-img-top")).getAttribute("src")

      if ( floor === 0.0) floor = price

      listings.push({
        _id: `${"Magic Eden"}-${tokenAddr}`,
        updAt: now,
        title,
        img,
        url,
        tokenAddr,
        tokenNum,
        coll,
        mp: "Magic Eden",
        price,
        forSale: true,
      })
    }

    await upsertListings(db, {
      _id: coll,
      updAt: now,
      floor,
      listings,
      errMsg: "",
    })
    console.log(`upserted ${listings.length} listings for ${coll}...`)
  } catch(error) {
    const errMsg = `error scraping ${coll} ` + error
    console.log(errMsg)
    await upsertListings(db, {
      _id: coll,
      updAt: now,
      errMsg,
    })
  }
}

// database

const dbName = process.env.DB_NAME;
const dbUrl = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PWD}@${process.env.DB_HOST}/${process.env.DB_NAME}?retryWrites=true&w=majority`
const client = new MongoClient(dbUrl);

async function createDb() {
  console.log('Connecting to db: ', dbUrl)
  await client.connect();
  console.log('Connected to db...');
  return client.db(dbName);
}

async function getCollMaps(db) {
  const collection = db.collection('collectionMappings');
  return await collection.find({
    inact: false,
    edenColl: { '$exists': true },
  }).toArray();
}

async function upsertListings(db, listings) {
  const collection = db.collection('edenListings');
  await collection.updateOne({ _id: listings._id }, { $set: listings }, { upsert: true });
}

// utils

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const edenUrl = "https://magiceden.io/marketplace"

scrapeCollections()