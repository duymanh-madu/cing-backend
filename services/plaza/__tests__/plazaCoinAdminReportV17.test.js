'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {readCoinReport}=require('../plazaCoinAdminReportV17');

const UUID='123e4567-e89b-12d3-a456-426614174000';
const DATE='2026-10-10T05:00:00.000Z';

function fixture(){
  return {
    vndPerCoin:1000,
    lifetime:{
      issued:14,spent:3,
      convertedVnd:14000,ledgerCount:4
    },
    period:{
      issued:10,spent:3,
      convertedVnd:10000,ledgerCount:3
    },
    outstanding:{
      coins:11,accountCount:2,
      expectedCoins:11,delta:0,balanced:true
    },
    walletReconciliation:{
      status:'MATCHED',
      coinConversions:2,
      walletCoinPayments:2,
      coinConvertedVnd:14000,
      walletDebitVnd:14000,
      missingWalletTransactions:0,
      mismatchedWalletTransactions:0,
      orphanWalletTransactions:0
    },
    walletFlowsPeriod:{
      walletTopupRealVnd:50000,
      walletPromotionBonusVnd:5000,
      invalidWalletPaymentCount:0,
      coinWalletPaymentsVnd:10000,
      otherWalletPaymentsVnd:5000,
      otherWalletPaymentCount:1,
      allPaymentDebitsVnd:15000,
      orderPaymentsVerifiedVnd:5000,
      posPaymentsVerifiedVnd:0,
      gamePaymentsVnd:0,
      unclassifiedPaymentsVnd:0,
      categoryBalanced:true,
      orderEvidenceStatus:'PAYMENT_VERIFIED_VAT_UNVERIFIED',
      posEvidenceStatus:'POS_PAID_IPOS_INVOICE_UNVERIFIED',
      drinkSalesVnd:null,
      drinkClassificationStatus:'UNVERIFIED'
    },
    items:[
      {
        id:UUID,
        operation:'convert',
        coin_delta:10,
        price_vnd:10000,
        created_at:DATE
      }
    ],
    nextCursor:{id:UUID,createdAt:DATE}
  };
}

function mock(result=fixture()){
  const calls=[];
  const db={
    rpc:async(name,args)=>{
      calls.push({name,args});
      return {data:result,error:null};
    }
  };
  return {db,calls};
}

test('report uses the exact read-only RPC and preserves monetary totals',
  async()=>{
    const {db,calls}=mock();
    const result=await readCoinReport({
      from:'2026-10-01T00:00:00.000Z',
      to:'2026-10-11T00:00:00.000Z',
      limit:'50'
    },db);

    assert.equal(calls.length,1);
    assert.equal(
      calls[0].name,
      'cing_plaza_coin_admin_report_v17'
    );
    assert.equal(calls[0].args.p_limit,50);
    assert.equal(result.lifetime.issued,14);
    assert.equal(result.lifetime.spent,3);
    assert.equal(result.outstanding.coins,11);
    assert.equal(result.period.convertedVnd,10000);
    assert.equal(result.walletReconciliation.status,'MATCHED');
    assert.equal(result.walletFlowsPeriod.otherWalletPaymentsVnd,5000);
    assert.equal(result.walletFlowsPeriod.drinkSalesVnd,null);
  }
);

test('pagination cursor is reversible, stable and owner-independent',
  async()=>{
    const first=mock();
    const page1=await readCoinReport({},first.db);
    const second=mock({...fixture(),nextCursor:null});

    await readCoinReport({
      cursor:page1.nextCursor,
      limit:'50'
    },second.db);

    assert.equal(second.calls[0].args.p_before_id,UUID);
    assert.equal(
      second.calls[0].args.p_before_created_at,
      DATE
    );
  }
);

test('invalid date, window and limit fail before any DB call',
  async()=>{
    const {db,calls}=mock();

    for(const query of [
      {from:'invalid-date'},
      {to:'invalid-date'},
      {
        from:'2026-10-11T00:00:00Z',
        to:'2026-10-10T00:00:00Z'
      },
      {limit:'0'},
      {limit:'101'},
      {limit:'1.5'},
      {limit:'999999999999999999'}
    ]){
      await assert.rejects(
        readCoinReport(query,db),
        error=>error.statusCode===400
      );
    }

    assert.equal(calls.length,0);
  }
);

test('malformed cursor UUID and malformed base64 are rejected',
  async()=>{
    const {db,calls}=mock();

    const badCursor=Buffer.from(JSON.stringify({
      id:'12345678------------------------------------',
      createdAt:DATE
    })).toString('base64url');

    for(const cursor of ['!!!!',badCursor]){
      await assert.rejects(
        readCoinReport({cursor},db),
        error=>error.statusCode===400
      );
    }

    assert.equal(calls.length,0);
  }
);

test('a real account mismatch remains visible, not auto-corrected',
  async()=>{
    const value=fixture();
    value.outstanding={
      ...value.outstanding,
      coins:10,
      delta:-1,
      balanced:false
    };

    const {db}=mock(value);
    const result=await readCoinReport({},db);

    assert.equal(result.outstanding.balanced,false);
    assert.equal(result.outstanding.delta,-1);
    assert.equal(result.outstanding.coins,10);
  }
);

test('fabricated balanced status and arithmetic errors fail closed',
  async()=>{
    for(const broken of [
      {...fixture(),outstanding:{
        ...fixture().outstanding,
        balanced:true,delta:1
      }},
      {...fixture(),outstanding:{
        ...fixture().outstanding,
        expectedCoins:999
      }},
      {...fixture(),lifetime:{
        ...fixture().lifetime,
        issued:Number.MAX_SAFE_INTEGER+1
      }}
    ]){
      const {db}=mock(broken);

      await assert.rejects(
        readCoinReport({},db),
        error=>error.statusCode===503
      );
    }
  }
);

test('RPC errors and malformed reports fail closed',
  async()=>{
    const missing=mock({});
    await assert.rejects(
      readCoinReport({},missing.db),
      error=>error.statusCode===503
    );

    const broken={
      rpc:async()=>({
        data:null,
        error:{code:'DATABASE_NOT_READY'}
      })
    };

    await assert.rejects(
      readCoinReport({},broken),
      error=>error.statusCode===503
    );
  }
);

test('SQL mirrors, service-role restriction and pagination guards',
  ()=>{
    const root=path.resolve(__dirname,'../../..');

    const sqlA=fs.readFileSync(
      path.join(root,
        'db/migrations/20261010030000_cing_plaza_coin_admin_report_v17.sql'
      ),'utf8'
    );
    const sqlB=fs.readFileSync(
      path.join(root,
        'supabase/migrations/20261010030000_cing_plaza_coin_admin_report_v17.sql'
      ),'utf8'
    );

    assert.equal(sqlA,sqlB);
    assert.match(sqlA,/security invoker/i);
    assert.match(sqlA,/p_limit is null/i);
    assert.match(sqlA,/to service_role/i);
    assert.match(sqlA,/from public\.cing_plaza_coin_ledger_v16/i);
    assert.match(sqlA,/from public\.cing_plaza_coin_accounts_v16/i);
    assert.match(sqlA,/created_at desc.*id desc/i);
    assert.doesNotMatch(
      sqlA,
      /\b(?:insert\s+into|update\s+public|delete\s+from|truncate\s+table)\b/i
    );
  }
);

test('Admin Coin route requires existing reporting permission',
  ()=>{
    const root=path.resolve(__dirname,'../../..');
    const routes=fs.readFileSync(
      path.join(root,'routes/adminWalletRoutes.js'),
      'utf8'
    );

    assert.match(
      routes,
      /"\/coin-report",\s*requirePanelPermission\("wallet\.reporting\.read"\)/
    );
  }
);


test('Wallet ↔ Coin mismatch is preserved for investigation',
  async()=>{
    const value=fixture();
    value.walletReconciliation={
      ...value.walletReconciliation,
      status:'MISMATCH',
      missingWalletTransactions:1,
      walletCoinPayments:1,
      walletDebitVnd:11000
    };
    const result=await readCoinReport({},mock(value).db);
    assert.equal(result.walletReconciliation.status,'MISMATCH');
    assert.equal(
      result.walletReconciliation.missingWalletTransactions,1
    );
  }
);

test('fabricated Wallet MATCHED status fails closed',
  async()=>{
    const value=fixture();
    value.walletReconciliation={
      ...value.walletReconciliation,
      missingWalletTransactions:1
    };
    await assert.rejects(
      readCoinReport({},mock(value).db),
      error=>error.statusCode===503
    );
  }
);

test('unclassified Wallet payments cannot masquerade as drink revenue',
  async()=>{
    const value=fixture();
    value.walletFlowsPeriod={
      ...value.walletFlowsPeriod,
      drinkSalesVnd:5000
    };
    await assert.rejects(
      readCoinReport({},mock(value).db),
      error=>error.statusCode===503
    );
  }
);

test('SQL performs both-direction joins and preserves exact references',
  ()=>{
    const sql=fs.readFileSync(path.resolve(
      __dirname,
      '../../../db/migrations/20261010030000_cing_plaza_coin_admin_report_v17.sql'
    ),'utf8');

    assert.match(sql,/coin_to_wallet as/i);
    assert.match(sql,/wallet_to_coin as/i);
    assert.match(sql,/plaza-coin-v16:/);
    assert.match(sql,/cing_plaza_coin_v16/);
    assert.match(sql,/w\.reference_id=c\.command_id::text/);
    assert.match(sql,/w\.amount is distinct from -c\.price_vnd/);
    assert.match(sql,/orphan_wallet/);
    assert.match(sql,/drinkClassificationStatus','UNVERIFIED'/);
  }
);


test('Wallet debit categories reconcile exactly',async()=>{
  const result=await readCoinReport({},mock(fixture()).db);
  const flow=result.walletFlowsPeriod;

  assert.equal(flow.allPaymentDebitsVnd,15000);

  assert.equal(
    flow.coinWalletPaymentsVnd+
    flow.orderPaymentsVerifiedVnd+
    flow.posPaymentsVerifiedVnd+
    flow.gamePaymentsVnd+
    flow.unclassifiedPaymentsVnd,
    flow.allPaymentDebitsVnd
  );

  assert.equal(flow.drinkSalesVnd,null);
  assert.equal(flow.categoryBalanced,true);
});

test('fabricated cashflow categories fail closed',async()=>{
  const broken=fixture();

  broken.walletFlowsPeriod={
    ...broken.walletFlowsPeriod,
    gamePaymentsVnd:5000
  };

  await assert.rejects(
    readCoinReport({},mock(broken).db),
    error=>error.statusCode===503
  );
});

test('unclassified payments remain visible instead of disappearing',
  async()=>{
    const report=fixture();

    report.walletFlowsPeriod={
      ...report.walletFlowsPeriod,
      orderPaymentsVerifiedVnd:0,
      unclassifiedPaymentsVnd:5000
    };

    const result=await readCoinReport({},mock(report).db);

    assert.equal(
      result.walletFlowsPeriod.unclassifiedPaymentsVnd,
      5000
    );

    assert.equal(
      result.walletFlowsPeriod.drinkSalesVnd,
      null
    );
  }
);

test('SQL joins the canonical app-order and POS payment evidence',
  ()=>{
    const sql=fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../db/migrations/20261010030000_cing_plaza_coin_admin_report_v17.sql'
      ),
      'utf8'
    );

    assert.match(sql,/public\.payment_transactions p/);
    assert.match(sql,/public\.cing_wallet_pos_payment_intents i/);
    assert.match(sql,/p\.payment_purpose='order'/);
    assert.match(sql,/p\.payment_status='paid'/);
    assert.match(sql,/p\.settlement_verified_at is not null/);
    assert.match(sql,/p\.order_created is true/);
    assert.match(sql,/i\.wallet_transaction_id=w\.id/);
    assert.match(sql,/unclassifiedPaymentsVnd/);
    assert.match(sql,/PAYMENT_VERIFIED_VAT_UNVERIFIED/);
    assert.match(sql,/POS_PAID_IPOS_INVOICE_UNVERIFIED/);
  }
);


test('topup cash and promotional bonus remain separate from spending',
  async()=>{
    const value=fixture();
    const result=await readCoinReport({},mock(value).db);

    assert.equal(result.walletFlowsPeriod.walletTopupRealVnd,50000);
    assert.equal(result.walletFlowsPeriod.walletPromotionBonusVnd,5000);
    assert.equal(result.walletFlowsPeriod.allPaymentDebitsVnd,15000);

    // Cash topups are never added to payment debit totals.
    assert.equal(result.walletFlowsPeriod.categoryBalanced,true);
  }
);

test('issued Coin must equal its fixed 1000 VND conversion',
  async()=>{
    const value=fixture();

    value.period={
      ...value.period,
      convertedVnd:9000
    };

    await assert.rejects(
      readCoinReport({},mock(value).db),
      error=>error.statusCode===503
    );
  }
);

test('mismatched lifetime Coin-to-VND totals fail closed',
  async()=>{
    const value=fixture();

    value.walletReconciliation={
      ...value.walletReconciliation,
      coinConvertedVnd:13000,
      walletDebitVnd:13000
    };

    await assert.rejects(
      readCoinReport({},mock(value).db),
      error=>error.statusCode===503
    );
  }
);

test('zero or positive Wallet payment cannot be counted as healthy',
  async()=>{
    const value=fixture();

    value.walletFlowsPeriod={
      ...value.walletFlowsPeriod,
      invalidWalletPaymentCount:1,
      categoryBalanced:false
    };

    await assert.rejects(
      readCoinReport({},mock(value).db),
      error=>error.statusCode===503
    );
  }
);

test('SQL separates real topups, promotional credits and invalid payments',
  ()=>{
    const sql=fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../db/migrations/20261010030000_cing_plaza_coin_admin_report_v17.sql'
      ),
      'utf8'
    );

    assert.match(sql,/wallet_topup_real_vnd/);
    assert.match(sql,/wallet_promotion_bonus_vnd/);
    assert.match(sql,/invalid_payment_count/);
    assert.match(sql,/transaction_type='topup_promotion'/);
    assert.match(sql,/transaction_type='topup'/);
    assert.match(sql,/walletTopupRealVnd/);
    assert.match(sql,/walletPromotionBonusVnd/);
  }
);
