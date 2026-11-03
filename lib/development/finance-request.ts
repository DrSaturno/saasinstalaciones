/** No preview bypass exists in production or on a non-local host. */
export function isFinanceDevelopmentRequest(request:Request) {
  if(process.env.NODE_ENV!=='development')return false;
  const url=new URL(request.url);
  const host=request.headers.get('host')??url.host;
  try {
    const target=new URL(`${url.protocol}//${host}`),origin=request.headers.get('origin');
    return ['localhost','127.0.0.1','[::1]'].includes(target.hostname)&&(!origin||new URL(origin).host===target.host);
  }catch{return false;}
}
