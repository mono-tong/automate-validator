import axios from 'axios';
import chalk from 'chalk';
import isUrl from 'is-url-superb';
import puppeteer from 'puppeteer';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';
import { conf, SCOPES } from './config.js';

const { docId, sheetId, startRow, endRow, username, password, localHost } = conf;
const urlCol = conf.urlCol.toUpperCase();
const jsCol = conf.jsCol.toUpperCase();
let arrJsCell = [];

const startValidator = async () => {
  const creds = JSON.parse(readFileSync('./key/credentials.json', 'utf-8'));
  const jwt = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
  });

  const doc = new GoogleSpreadsheet(docId, jwt);
  await doc.loadInfo();

  const sheet = doc.sheetsById[sheetId];
  await sheet.loadCells(`${urlCol}${startRow}:${jsCol}${endRow}`);

  for (let i = startRow; i <= endRow; i++) {
    const cellUrl = sheet.getCellByA1(`${urlCol}${i}`);

    if (!cellUrl.value || !isUrl(cellUrl.value)) {
      continue;
    }

    const url = new URL(cellUrl.value);
    const urlPath = url.pathname.match(/\.html/g) ? url.pathname : url.pathname + 'index.html';
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
      const errorMsg = err?.response ? `${err?.response?.status} ${err?.response?.statusText}` : err?.code;
      console.error(chalk.red(`Error: ${errorMsg}`));
    }

    if (!response) {
      continue;
    }

    arrJsCell[i] = sheet.getCellByA1(`${jsCol}${i}`);

    // start Puppeteer testing
    const browser = await puppeteer.launch({ headless: 'new' });
    const testPage = await browser.newPage();
    const errorsMsg = [];

    testPage
      .on('console', (message) => {
        if (message.type() === 'error') {
          const errorText = `${message.text()}\r\nUrl: ${message.location()?.url}`
          errorsMsg.push(errorText);
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
      arrJsCell[i].value = errorsMsg.map((msg) => `[Error]\r\n${msg}\r\n`).join('\r\n');
      arrJsCell[i].horizontalAlignment = 'LEFT';
      console.info(chalk.blue('JS:'), absUrl, chalk.red('ERROR'));
    } else {
      arrJsCell[i].value = 'o';
      arrJsCell[i].horizontalAlignment = 'CENTER';
      console.info(chalk.blue('JS:'), absUrl, chalk.green('PASS'));
    }
  }

  console.info(chalk.green('Saving data to Google Sheets.'));
  await sheet.saveUpdatedCells();
};

startValidator();
