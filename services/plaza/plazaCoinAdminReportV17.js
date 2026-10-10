'use strict';

// Supabase is loaded only for an authorized runtime request.

function validDate(value) {
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))
    throw Object.assign(new Error('PLAZA_COIN_INVALID_DATE'),{statusCode:400});
  return new Date(value).toISOString();
}

async function readCoinReport(query={},db) {
  const from=validDate(query.from);
  const to=validDate(query.to);

  if(from&&to&&Date.parse(to)<=Date.parse(from))
    throw Object.assign(new Error('PLAZA_COIN_INVALID_RANGE'),{statusCode:400});

  const rawLimit=query.limit??'50';
  if(typeof rawLimit!=='string'||!/^[1-9][0-9]*$/.test(rawLimit)||
     Number(rawLimit)>100)
    throw Object.assign(new Error('PLAZA_COIN_INVALID_LIMIT'),{statusCode:400});

  let beforeCreatedAt=null;
  let beforeId=null;

  if(query.cursor!==undefined){
    if(typeof query.cursor!=='string'||query.cursor.length>500)
      throw Object.assign(new Error('PLAZA_COIN_INVALID_CURSOR'),{statusCode:400});
    try{
      const decoded=JSON.parse(
        Buffer.from(query.cursor,'base64url').toString('utf8')
      );
      const id=String(decoded.id||'');
      if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
        throw new Error('Invalid id');
      beforeCreatedAt=validDate(decoded.createdAt);
      beforeId=id;
      if(!beforeCreatedAt)throw new Error('Invalid date');
    }catch{
      throw Object.assign(new Error('PLAZA_COIN_INVALID_CURSOR'),{statusCode:400});
    }
  }

  const {data,error}=await (db||require('../../supabase')).rpc(
    'cing_plaza_coin_admin_report_v17',{
      p_from:from,
      p_to:to,
      p_before_created_at:beforeCreatedAt,
      p_before_id:beforeId,
      p_limit:Number(rawLimit)
    }
  );

  if(error){
    console.error('[Plaza Coin Admin] reporting unavailable',error.code);
    throw Object.assign(
      new Error('PLAZA_COIN_REPORT_UNAVAILABLE'),
      {statusCode:503}
    );
  }

  if(!data||!Array.isArray(data.items)||
     !data.lifetime||!data.period||!data.outstanding)
    throw Object.assign(
      new Error('PLAZA_COIN_REPORT_INVALID'),
      {statusCode:503}
    );


  // Fail closed on malformed or internally inconsistent financial totals.
  // An actual balance discrepancy is reported, never silently corrected.
  const safeCount=(value)=>{
    const n=Number(value);
    return Number.isSafeInteger(n)&&n>=0?n:null;
  };

  for(const [object,fields] of [
    [data.lifetime,['issued','spent','convertedVnd','ledgerCount']],
    [data.period,['issued','spent','convertedVnd','ledgerCount']],
    [data.outstanding,['coins','accountCount']]
  ]){
    for(const field of fields){
      if(safeCount(object[field])===null){
        throw Object.assign(
          new Error('PLAZA_COIN_REPORT_INVALID'),
          {statusCode:503}
        );
      }
    }
  }

  const expected=
    Number(data.lifetime.issued)-Number(data.lifetime.spent);

  const actual=Number(data.outstanding.coins);
  const delta=actual-expected;

  if(
    !Number.isSafeInteger(expected)||
    !Number.isSafeInteger(delta)||
    Number(data.outstanding.expectedCoins)!==expected||
    Number(data.outstanding.delta)!==delta||
    data.outstanding.balanced!==(delta===0)
  ){
    throw Object.assign(
      new Error('PLAZA_COIN_REPORT_INVALID'),
      {statusCode:503}
    );
  }


  const reconciliation=data.walletReconciliation;
  const flows=data.walletFlowsPeriod;

  if(
    !reconciliation||typeof reconciliation!=='object'||
    !flows||typeof flows!=='object'||
    !['MATCHED','MISMATCH'].includes(reconciliation.status)||
    flows.drinkClassificationStatus!=='UNVERIFIED'||
    flows.drinkSalesVnd!==null
  ){
    throw Object.assign(
      new Error('PLAZA_COIN_REPORT_INVALID'),
      {statusCode:503}
    );
  }

  for(const field of [
    'coinConversions','walletCoinPayments',
    'coinConvertedVnd','walletDebitVnd',
    'missingWalletTransactions',
    'mismatchedWalletTransactions',
    'orphanWalletTransactions'
  ]){
    if(safeCount(reconciliation[field])===null){
      throw Object.assign(
        new Error('PLAZA_COIN_REPORT_INVALID'),
        {statusCode:503}
      );
    }
  }

  for(const field of [
    'coinWalletPaymentsVnd','otherWalletPaymentsVnd',
    'otherWalletPaymentCount'
  ]){
    if(safeCount(flows[field])===null){
      throw Object.assign(
        new Error('PLAZA_COIN_REPORT_INVALID'),
        {statusCode:503}
      );
    }
  }

  if(
    reconciliation.status==='MATCHED'&&(
      reconciliation.missingWalletTransactions!==0||
      reconciliation.mismatchedWalletTransactions!==0||
      reconciliation.orphanWalletTransactions!==0||
      reconciliation.coinConversions!==reconciliation.walletCoinPayments||
      reconciliation.coinConvertedVnd!==reconciliation.walletDebitVnd
    )
  ){
    throw Object.assign(
      new Error('PLAZA_COIN_REPORT_INVALID'),
      {statusCode:503}
    );
  }


  // Every Wallet debit must be accounted for exactly once.
  // Settlement evidence is not interchangeable with VAT invoice proof.
  for(const field of [
    'walletTopupRealVnd',
    'walletPromotionBonusVnd',
    'invalidWalletPaymentCount',
    'allPaymentDebitsVnd',
    'orderPaymentsVerifiedVnd',
    'posPaymentsVerifiedVnd',
    'gamePaymentsVnd',
    'unclassifiedPaymentsVnd'
  ]){
    if(safeCount(flows[field])===null){
      throw Object.assign(
        new Error('PLAZA_COIN_REPORT_INVALID'),
        {statusCode:503}
      );
    }
  }

  const classified=
    Number(flows.coinWalletPaymentsVnd)+
    Number(flows.orderPaymentsVerifiedVnd)+
    Number(flows.posPaymentsVerifiedVnd)+
    Number(flows.gamePaymentsVnd)+
    Number(flows.unclassifiedPaymentsVnd);

  const otherClassified=
    Number(flows.orderPaymentsVerifiedVnd)+
    Number(flows.posPaymentsVerifiedVnd)+
    Number(flows.gamePaymentsVnd)+
    Number(flows.unclassifiedPaymentsVnd);

  if(
    !Number.isSafeInteger(classified)||
    !Number.isSafeInteger(otherClassified)||
    classified!==Number(flows.allPaymentDebitsVnd)||
    otherClassified!==Number(flows.otherWalletPaymentsVnd)||
    flows.categoryBalanced!==true||
    Number(flows.invalidWalletPaymentCount)!==0||
    flows.orderEvidenceStatus!=='PAYMENT_VERIFIED_VAT_UNVERIFIED'||
    flows.posEvidenceStatus!=='POS_PAID_IPOS_INVOICE_UNVERIFIED'
  ){
    throw Object.assign(
      new Error('PLAZA_COIN_REPORT_INVALID'),
      {statusCode:503}
    );
  }


  // Every issued Coin has a fixed 1,000 VND conversion value.
  if(data.vndPerCoin!==1000){
    throw Object.assign(
      new Error('PLAZA_COIN_REPORT_INVALID'),
      {statusCode:503}
    );
  }

  for(const totals of [data.lifetime,data.period]){
    const issued=Number(totals.issued);
    const converted=Number(totals.convertedVnd);
    const expectedVnd=issued*1000;

    if(
      !Number.isSafeInteger(expectedVnd)||
      converted!==expectedVnd
    ){
      throw Object.assign(
        new Error('PLAZA_COIN_REPORT_INVALID'),
        {statusCode:503}
      );
    }
  }

  if(
    Number(reconciliation.coinConvertedVnd)!==
    Number(data.lifetime.convertedVnd)
  ){
    throw Object.assign(
      new Error('PLAZA_COIN_REPORT_INVALID'),
      {statusCode:503}
    );
  }

  if(data.nextCursor){
    const id=String(data.nextCursor.id||'');
    const date=data.nextCursor.createdAt;
    if(
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||
      typeof date!=='string'||
      !Number.isFinite(Date.parse(date))
    ){
      throw Object.assign(
        new Error('PLAZA_COIN_REPORT_INVALID'),
        {statusCode:503}
      );
    }
  }

  return {
    ...data,
    nextCursor:data.nextCursor
      ?Buffer.from(JSON.stringify(data.nextCursor)).toString('base64url')
      :null
  };
}

module.exports={readCoinReport};
