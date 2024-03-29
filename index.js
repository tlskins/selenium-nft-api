var webdriver = require('selenium-webdriver'),
chrome    = require('selenium-webdriver/chrome')
Key = webdriver.Key,
By        = webdriver.By,
until     = webdriver.until
Actions = webdriver.Actions
const { MongoClient } = require('mongodb')
require("chromedriver")
require("dotenv/config")
var moment = require("moment")


async function scrapeCollections(){
  const db = await createDb()
  let collMaps = await getCollMaps(db)
  if (!collMaps) throw Error("Collections not found")
  const batches = parseInt(process.env.BATCHES)
  const batchNum = parseInt(process.env.BATCH_NUM)
  collMaps = collMaps.filter((_,i) => i % batches === batchNum-1)
  
  var options   = new chrome.Options()
  // options.addArguments('disable-gpu')
  options.addArguments('headless') // note: without dashes
  options.addArguments('--window-size=1920,1080')
  options.addArguments('--disable-blink-features=AutomationControlled')
  options.addArguments('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36')

  let driver = await new webdriver.Builder()
    .forBrowser("chrome")
    .withCapabilities(webdriver.Capabilities.chrome()) 
    .setChromeOptions(options)
    .build()

  console.log(`${moment().format()}: scraping ${collMaps.length} collections`)
  let fails = 0
  while ( true ) {
    for (let i=0;i<collMaps.length;i++) {
      
      const collMap = collMaps[i]
      // const collMap = collMaps.find( c => c.coll === "Balloonsville" ) // testing
      if ( !collMap ) throw "Collection mapping not found"

      try {
        await scrape(db, driver, collMap)
        fails = 0
      } catch(error) {
        const errMsg = `error scraping ${collMap.coll} ` + error
        console.log(errMsg)

        fails++
        if ( fails <= 2 ) {
          i--
        } else {
          await upsertSnapshot(db, {
            _id: `Magic Eden-${collMap.coll}`,
            updAt: moment().toDate(),
            errMsg,
          })
          fails = 0
        }
      }
      driver.sleep(100)
    }

    console.log('Finished loop of all collections...')
  }

}

async function scrape(db, driver, collMap) {
  const { coll, edenColl } = collMap
  const now = moment().toDate()

  const url = `${edenUrl}/${edenColl}`
  console.log(`\n${now}: scraping ${collMap.coll}\n${url}`)
  await driver.get(url)

  await driver.sleep(300) // collection-filter doesnt render immediately

  // get number listed
  const attrsRow = await driver.wait(until.elementLocated(By.className("attributes-row")), 10000);
  // const attrsRow = await driver.findElement(By.className("attributes-row"))
  const collAttrs = await attrsRow.findElements(By.className("attributes-column"))
  const numListTxt = await collAttrs[collAttrs.length-1].findElement(By.className("attribute-value")).getText()
  const listedCount = parseInt( numListTxt )

  // find sale and items buttons
  let viewBtns = await driver.findElements(By.className("me-tab2"))
  const salesBtn = viewBtns[1]

  // get recent activity
  console.log("clicking sales...")
  await salesBtn.click()
  // await driver.executeScript("arguments[0].click()", salesBtn)
  await driver.sleep(150)

  const sales = []
  for (let currSalesPg=0;currSalesPg<2;currSalesPg++) {
    // scrape sales
    console.log(`scraping sales page ${currSalesPg}`)
    const salesTable = await driver.findElement(By.className("me-table__container"))
    const salesRows = await salesTable.findElements(By.css("tr"))
    console.log(`${salesRows.length} sales found`)
    for(let i=0;i<salesRows.length;i++) {
      const salesRow = salesRows[i]
      const cells = await salesRow.findElements(By.css("td"))
      if ( cells.length === 0 ) continue

      const title = await cells[1].getText()
      const tokenNum = getTokenNum(title)
      const priceStr = await cells[5].getText()
      const price = parseFloat(priceStr.replace(/ SOL/, ""))
      if (isNaN(price)) {
        console.log(`*** NAN FOUND - ${title}: ${priceStr}`)
        continue
      }
      const url = await salesRow.findElement(By.linkText(title)).getAttribute("href")
      const tokenAddr = url.match(/item-details\/([a-zA-Z0-9]+)/)[1]
      // const imgTxt = await salesRow.findElement(By.className("card-img-top")).getAttribute("src")
      // const img = imgTxt.match(/(https:\/\/metadata.+)/)[1]
      const txUrl = await cells[2].findElement(By.css("a")).getAttribute("href")
      const txAddr = txUrl.match(/\/tx\/([a-zA-Z0-9]+)/)[1]
      const agoStr = await cells[4].getText()
      const date = getDateFrom(agoStr).format()

      sales.push({
        _id: `Magic Eden-${txAddr}`,
        nm: title,
        tokenNum,
        price,
        date,
        mp: "Magic Eden",
        coll,
        tokenAddr,
      })
    }

    // next page
    if ( currSalesPg < salesRows.length-1 ) {
      const tableNav = await driver.findElement(By.className("me-table__pagination"))
      const tableNavBtns = await tableNav.findElements(By.className("me-table__pagination-btn"))
      const nextPgBtn = tableNavBtns[2]

      // reached end of pages
      const disableTxt = await nextPgBtn.getAttribute("disabled")
      if ( disableTxt ) break

      await driver.executeScript("window.scrollTo(0, document.body.scrollHeight)")
      await driver.executeScript("arguments[0].click()", nextPgBtn)
      await driver.sleep(50)
    }
  }

  // get listings
  console.log("clicking listings...")
  await driver.executeScript("window.scrollTo(0,0)")
  const page = await driver.findElement(By.css("body"))
  await page.sendKeys(Key.CONTROL + Key.HOME)
  viewBtns = await driver.findElements(By.className("me-tab2"))
  const itemsBtn = viewBtns[0]
  console.log('clickin items btn')
  await driver.executeScript("arguments[0].click()", itemsBtn)
  await driver.sleep(50)
  
  // sort listings cheapest first
  console.log("sorting listings...")
  const filtersEl = await driver.findElement(By.className("collection-filter"))
  const sortSel = await filtersEl.findElement(By.className("me-dropdown-container"))
  await driver.executeScript("arguments[0].scrollIntoView();", sortSel)
  await sortSel.click()
  const sortOpts = await filtersEl.findElements(By.className("me-select-item"))
  for(let i=0;i<sortOpts.length;i++) {
    const opt = sortOpts[i]
    const optTxt = await opt.getText()
    if ( optTxt.toLocaleLowerCase().includes("low to high")) {
      await opt.click()
      break
    }
  }

  // scroll down to load more listings
  console.log("scrolling for listings...")
  await driver.sleep(20);
  driver.executeScript("window.scrollTo(0, document.body.scrollHeight)")
  await driver.sleep(20)
  driver.executeScript("window.scrollTo(0, document.body.scrollHeight)")
  await driver.sleep(150)

  // scrape listings
  const els = await driver.findElements(By.className("grid-card__main"))
  const listings = []
  let floor = 0.0
  for(let i=0;i<els.length;i++) {
    const el = els[i]
    const title = await el.findElement(By.className("grid-card__title")).getText()
    const tokenNum = getTokenNum(title)
    const priceStr = await el.findElement(By.className("card__price")).getText()
    const price = parseFloat(priceStr.replace(/ SOL/, ""))
    const url = await el.findElement(By.linkText(title)).getAttribute("href")
    const tokenAddr = url.match(/item-details\/([a-zA-Z0-9]+)/)[1]
    const img = await el.findElement(By.className("card-img-top")).getAttribute("src")

    if (isNaN(price)) {
      console.log(`*** NAN FOUND - ${title}: ${priceStr}`)
      continue
    }

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
  
  console.log('upserting listings...')
  await upsertSnapshot(db, {
    _id: `Magic Eden-${collMap.coll}`,
    updAt: now,
    coll,
    mkt: "Magic Eden",
    floor,
    listedCount,
    listings,
    sales,
    errMsg: "",
  })
  console.log(`${moment().format()}: upserted ${listings.length} listings for ${coll}...`)
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

async function upsertSnapshot(db, listings) {
  const collection = db.collection('marketSnapshots');
  await collection.updateOne({ _id: listings._id }, { $set: listings }, { upsert: true });
}

// utils

function getDateFrom(agoStr) {
  const unitsMatch = agoStr.match(/\d+/)
  const units = -1 * parseInt(unitsMatch[0])
  const uom = agoStr.match(/\d+ ([a-z]+) ago/)[1]

  return moment().add(units, uom)
}

function getTokenNum(title) {
  const matches = title.match(/#(\d+)/)
  if ( !matches || matches.length < 2 ) {
    return 0
  }
  return parseInt(matches[1])
}

const edenUrl = "https://magiceden.io/marketplace"

scrapeCollections()