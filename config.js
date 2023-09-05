// service-email: google-sheet@trusty-pixel-329611.iam.gserviceaccount.com
export const conf = {
  docId: '',
  sheetId: '',
  urlCol: '',
  lintCol: '',
  jsCol: '',
  startRow: 0,
  endRow: 0,
  htmlIgnoreError: 'warning',
  username: '',
  password: '',
  localHost: null,
};

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];
