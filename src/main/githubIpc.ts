import { BrowserWindow, ipcMain } from 'electron';
import * as github from './github';
export function registerGitHubIpc(getWindow:()=>BrowserWindow|null){
 const repo=()=>{const window=getWindow() as (BrowserWindow&{__repo?:string})|null;if(!window?.__repo)throw new Error('No repository open');return window.__repo};
 const emit=(command:string)=>getWindow()?.webContents.send('git:command',{id:Date.now(),command,at:Date.now()});
 const wrap=async(command:string,fn:()=>Promise<unknown>)=>{emit(command);try{return{ok:true,data:await fn()}}catch(error:unknown){const value=error as {message?:string;stderr?:string};return{ok:false,error:{message:value.message??String(error),stderr:value.stderr??''}}}};
 ipcMain.handle('github:status',()=>wrap('github status',()=>github.status()));
 ipcMain.handle('github:saveToken',(_e,token:string)=>wrap('github sign-in',()=>github.saveToken(token)));
 ipcMain.handle('github:logout',()=>wrap('github sign-out',async()=>{await github.logout();return null}));
 ipcMain.handle('github:repos',(_e,query?:string)=>wrap('github repositories',()=>github.listRepos(query)));
 ipcMain.handle('github:clone',(_e,repository:github.GitHubRepo,transport:'https'|'ssh')=>wrap(`git clone ${repository.fullName} via ${transport}`,()=>github.cloneRepo(getWindow()!,repository,transport)));
 ipcMain.handle('github:git:fetch',(_e,remote:string)=>wrap(`git fetch --prune ${remote}`,()=>github.fetchRemote(repo(),remote)));
 ipcMain.handle('github:git:pull',()=>wrap('git pull --rebase',()=>github.pull(repo())));
 ipcMain.handle('github:git:push',(_e,setUpstream:boolean)=>wrap('git push',()=>github.push(repo(),setUpstream)));
}
