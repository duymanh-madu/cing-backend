'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail=code=>Object.assign(new Error(code),{code});
const exact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
function phone(value){if(typeof value!=='string')throw fail('ACCOUNT_IDENTITY_CONFLICT');const v=value.startsWith('+84')?'0'+value.slice(3):value.startsWith('84')?'0'+value.slice(2):value;if(!/^0[35789][0-9]{8}$/.test(v))throw fail('ACCOUNT_IDENTITY_CONFLICT');return v;}
const variants=v=>{const p=phone(v);return [p,'84'+p.slice(1),'+84'+p.slice(1)];};
function integer(v){if(typeof v==='string'&&!/^(0|[1-9][0-9]*)$/.test(v))throw fail('ACCOUNT_DATA_UNAVAILABLE');if(!['number','string'].includes(typeof v)||!Number.isSafeInteger(Number(v))||Number(v)<0)throw fail('ACCOUNT_DATA_UNAVAILABLE');return Number(v);}
function text(v,max=120){if(v===null)return null;if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw fail('ACCOUNT_DATA_UNAVAILABLE');return v;}
function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(v)||!Number.isFinite(Date.parse(v)))throw fail('ACCOUNT_DATA_UNAVAILABLE');return new Date(v).toISOString();}
function months(now){const d=new Date(now);if(!Number.isFinite(d.getTime()))throw fail('ACCOUNT_DATA_UNAVAILABLE');const vn=new Date(d.getTime()+7*3600000),y=vn.getUTCFullYear(),m=vn.getUTCMonth();const fmt=(y,m)=>`${y}-${String(m+1).padStart(2,'0')}`;return [fmt(y,m),m===0?fmt(y-1,11):fmt(y,m-1)];}
const unavailable=code=>({state:'unavailable',code});
module.exports={UUID,fail,exact,phone,variants,integer,text,date,months,unavailable};
