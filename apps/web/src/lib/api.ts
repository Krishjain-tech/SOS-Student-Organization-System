import { QueryClient, useQuery } from '@tanstack/react-query';
export type Row = Record<string, any>;
export type User = {id: string; name: string; email: string; phone?: string; roles: string[]};
export class ApiError extends Error { code: string; status: number; fields?: Record<string,string|string[]>; constructor(status:number,error:any){ super(error?.message || 'The request could not be completed.'); this.status=status; this.code=error?.code || 'REQUEST_FAILED'; this.fields=error?.fields; } }
let csrfToken = '';
export const queryClient = new QueryClient({defaultOptions:{queries:{staleTime:10000,refetchOnWindowFocus:true,retry:(count,error)=>!(error instanceof ApiError && [401,403,404].includes(error.status)) && count<1}}});
export async function api<T=any>(path:string, method='GET', data?:any):Promise<T> {
 if(method!=='GET' && !csrfToken){const response=await fetch('/api/v1/auth/csrf',{credentials:'same-origin'}); const body=await response.json(); if(!response.ok) throw new ApiError(response.status,body.error);csrfToken=body.data.csrfToken;}
 const response=await fetch(`/api/v1${path}`,{method,credentials:'same-origin',headers:{...(data instanceof FormData?{}:{'Content-Type':'application/json'}),...(method==='GET'?{}:{'X-CSRF-Token':csrfToken})},...(data===undefined?{}:{body:data instanceof FormData?data:JSON.stringify(data)})});
 const body=await response.json().catch(()=>({}));
 if(!response.ok){if(response.status===401){csrfToken='';if(path!=='/auth/me')window.dispatchEvent(new Event('session-expired'));}throw new ApiError(response.status,body.error);}
 if(path==='/auth/login'||path==='/auth/logout')csrfToken='';
 return body.data;
}
export const useData = <T=Row[]>(path:string,enabled=true) => useQuery<T>({queryKey:[path],queryFn:()=>api<T>(path),enabled,refetchInterval:30000,refetchIntervalInBackground:false});
export function refresh(){return queryClient.invalidateQueries({predicate:q=>q.queryKey[0]!=='session'});}
export const money=(paise:any)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:Number(paise)%100?2:0}).format(Number(paise||0)/100);
export const date=(value:any,withTime=false)=>value?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',...(withTime?{hour:'numeric',minute:'2-digit'}:{})}).format(new Date(value)):'—';
export const textStatus=(value:any)=>String(value||'').toLowerCase().replaceAll('_',' ').replace(/\b\w/g,s=>s.toUpperCase());
export const toLocal=(value:any)=>value?new Date(value).toISOString().slice(0,16):'';
export const toUtc=(value:any)=>value?new Date(value).toISOString():null;
export const rupees=(value:any)=>Math.round(Number(value||0)*100);
