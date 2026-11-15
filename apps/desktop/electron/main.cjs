const { app, BrowserWindow, ipcMain, protocol, net, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{scheme:'ju-app',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let mainWindow;
const isDev = !app.isPackaged;
const devUrl = 'http://127.0.0.1:5173';
const appOrigin = 'ju-app://bundle';

app.whenReady().then(async()=>{
  if(!isDev){
    protocol.handle('ju-app',request=>{
      const url=new URL(request.url);
      if(url.host!=='bundle') return new Response('Not found',{status:404});
      const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
      const base=path.resolve(app.getAppPath(),'dist');
      const file=path.resolve(base,relative);
      if(!file.startsWith(base+path.sep)&&file!==base) return new Response('Forbidden',{status:403});
      return net.fetch(pathToFileURL(file).toString());
    });
  }
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  mainWindow=new BrowserWindow({
    width:1380,height:900,minWidth:1000,minHeight:700,
    backgroundColor:'#f7f7f2',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}
  });
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',(event,url)=>{
    if(!url.startsWith(isDev?devUrl:appOrigin)) event.preventDefault();
  });
  await mainWindow.loadURL(isDev?devUrl:`${appOrigin}/index.html`);
});
ipcMain.handle('report:print',async(event)=>{
  if(!mainWindow||event.sender!==mainWindow.webContents)return false;
  const url=event.sender.getURL();
  if(!url.startsWith(isDev?devUrl:appOrigin))return false;
  return new Promise(resolve=>event.sender.print({printBackground:true},success=>resolve(success)));
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
