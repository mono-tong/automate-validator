const axios = require('axios');
const colors = require('colors/safe');
const isUrl = require('is-url-superb');
const puppeteer = require('puppeteer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const creds = require('./key/credentials.json');
const conf = require('./config');

const { docId, sheetId, startRow, endRow, username, password, localHost } = conf;
const urlCol = conf.urlCol.toUpperCase();
const jsCol = conf.jsCol.toUpperCase();
let arrJsCell = [];

const startValidator = async () => {
  const doc = new GoogleSpreadsheet(docId);
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();

  const sheet = doc.sheetsById[sheetId];
  await sheet.loadCells(`${urlCol}${startRow}:${jsCol}${endRow}`);

  for (let i = startRow; i <= endRow; i++) {
    const cellUrl = sheet.getCellByA1(`${urlCol}${i}`);

    if (!cellUrl.value || !isUrl(cellUrl.value)) {
      continue;
    }

    const url = new URL(cellUrl.value);
    const urlPath = url.pathname.match(/\.html/g)
      ? url.pathname
      : url.pathname + 'index.html';
    const absUrl = localHost ? `${localHost}${urlPath}` : url.href;
    let response = '';

    // check if page exists
    try {
      response = await axios.head(absUrl, {
        auth: {
          username: username,
          password: password,
        },
      });
    } catch (err) {
      const errorMsg = err?.response
        ? `${err?.response?.status} ${err?.response?.statusText}`
        : err?.code;
      console.error(colors.red(`Error: ${errorMsg}`));
    }

    if (!response) {
      continue;
    }

    arrJsCell[i] = sheet.getCellByA1(`${jsCol}${i}`);

    // start Puppeteer testing
    const browser = await puppeteer.launch();
    const testPage = await browser.newPage();
    const errorsMsg = [];

    testPage
      .on('console', (message) => {
        if (message.type() === 'error') {
          errorsMsg.push(message.text());
        }
      })
      .on('pageerror', ({ message }) => {
        errorsMsg.push(message);
      });

    if (username && password) {
      await testPage.authenticate({
        username: username,
        password: password,
      });
    }

    await testPage.goto(absUrl, {
      waitUntil: 'networkidle2',
    });
    await browser.close();

    if (errorsMsg.length > 0) {
      arrJsCell[i].value = errorsMsg
        .map((msg) => `[Error]\r\n${msg}\r\n`)
        .join('\r\n');
      arrJsCell[i].horizontalAlignment = 'LEFT';
      console.info(colors.blue('JS:'), absUrl, colors.red('ERROR'));
    } else {
      arrJsCell[i].value = 'o';
      arrJsCell[i].horizontalAlignment = 'CENTER';
      console.info(colors.blue('JS:'), absUrl, colors.green('PASS'));
    }
  }

  console.info(colors.green('Saving data to Google Sheets.'));
  await sheet.saveUpdatedCells();
};

startValidator();
