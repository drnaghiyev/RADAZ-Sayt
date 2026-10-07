import { createApp } from './app.mjs';
const {app,store}=createApp();
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||5188);
const server=app.listen(port,host,()=>console.log(`RADAZ site: http://${host}:${port}`));
server.requestTimeout=120000;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
