const router=require('express').Router();
const jwt=require('jsonwebtoken');const {JWT_SECRET}=require('../utils/jwtSecretAuthority');
const service=require('../services/plaza/plazaAdminCharacterV7').createPlazaAdminCharacterV7({supabase:require('../supabase')});
router.use((req,res,next)=>{try{const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw new Error();req.admin=jwt.verify(token,JWT_SECRET);next();}catch{res.status(401).json({success:false,code:'PLAZA_UNAUTHORIZED'});}});
for(const method of ['get','put'])router[method]('/character',async(req,res)=>{try{const data=await service.operate(req.admin,method==='get'?req.query:req.body,method==='put');res.json({success:true,...data});}catch(e){const code=/^PLAZA_[A-Z_]+$/.test(e.code||'')?e.code:'PLAZA_PROFILE_UNAVAILABLE';res.status(code==='PLAZA_SUPER_ADMIN_REQUIRED'?403:400).json({success:false,code});}});
module.exports=router;
