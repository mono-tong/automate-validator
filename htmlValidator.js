import axios from 'axios';
import chalk from 'chalk';
import isUrl from 'is-url-superb';
import { load as cheerioLoad } from 'cheerio';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { w3cHtmlValidator } from 'w3c-html-validator';
import { readFileSync } from 'fs';
import { conf, SCOPES } from './config.js';

const {
  docId,
  sheetId,
  startRow,
  endRow,
  htmlIgnoreError,
  username,
  password,
  localHost,
} = conf;
const urlCol = conf.urlCol.toUpperCase();
const lintCol = conf.lintCol.toUpperCase();
let arrLintCell = [];

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
  await sheet.loadCells(`${urlCol}${startRow}:${lintCol}${endRow}`);

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

    try {
      response = await axios.get(absUrl, {
        responseEncoding: 'utf8',
        responseType: 'text',
        auth: {
          username: username,
          password: password,
        },
      });
    } catch (err) {
      const errorMsg = err?.response
        ? `${err?.response?.status} ${err?.response?.statusText}`
        : err?.code;
      console.error(chalk.red(`Error: ${errorMsg}`));
    }

    if (!response?.data) {
      continue;
    }

    arrLintCell[i] = sheet.getCellByA1(`${lintCol}${i}`);

    // start html validator
    const validate = await w3cHtmlValidator.validate({
      html: response.data,
      ignoreLevel: htmlIgnoreError,
    });
    const htmlWarnMsg = [];
    const htmlErrorMsg = [];

    if (validate?.messages.length > 0) {
      for (let item of validate.messages) {
        switch (item.type) {
          case 'error':
            htmlErrorMsg.push(`[Error]\r\n${item.message}\r\nLine: ${item.lastLine}\r\n`);
            break;
          default:
            htmlWarnMsg.push(`[Warning]\r\n${item.message}\r\nLine: ${item.lastLine}\r\n`);
            break;
        }
      }
    }

    // start heading check
    const $ = cheerioLoad(response.data);
    const headingMsg = [];
    let prevH = 0;

    $('body')
      .find('h1, h2, h3, h4, h5, h6')
      .each((i, e) => {
        const h = Number(e.tagName.replace('h', ''));

        if (i === 0 && h !== 1) {
          headingMsg.push('[Heading]\r\nH1 tag is missing.\r\n');
        }

        if (i > 0 && h - prevH > 1) {
          headingMsg.push(`[Heading]\r\nH${h} tag seen after H${prevH} tag.\r\nText: ${$(e).text()}\r\n`);
        }

        prevH = h;
      });

    // collect all error msg
    const allErrors = [...htmlErrorMsg, ...htmlWarnMsg, ...headingMsg];

    if (allErrors.length) {
      arrLintCell[i].value = allErrors.join('\r\n');
      arrLintCell[i].horizontalAlignment = 'LEFT';
      console.info(chalk.blue('HTML:'), absUrl, chalk.red('ERROR'));
    } else {
      arrLintCell[i].value = 'o';
      arrLintCell[i].horizontalAlignment = 'CENTER';
      console.info(chalk.blue('HTML:'), absUrl, chalk.green('PASS'));
    }
  }

  console.info(chalk.green('Saving data to Google Sheets.'));
  await sheet.saveUpdatedCells();
};

startValidator();
