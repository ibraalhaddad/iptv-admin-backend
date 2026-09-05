const express=require('express'); const Setting=require('../models/Setting'); const {auth,requirePermission,scopeFilter,getWriteApplicationId}=require('../middleware/auth');
const router=express.Router();
router.get('/',auth,requirePermission('settings.view'),async(req,res)=>{const rows=await Setting.find(scopeFilter(req)); const out={}; rows.forEach(r=>out[r.key]=r.value); res.json(out);});
router.put('/',auth,requirePermission('settings.edit'),async(req,res)=>{try{const applicationId=getWriteApplicationId(req,req.body); const entries=Object.entries(req.body||{}).filter(([k])=>k!=='applicationId'); for(const [key,value] of entries){await Setting.findOneAndUpdate({applicationId,key},{applicationId,key,value},{upsert:true,new:true,setDefaultsOnInsert:true});} res.json({message:'تم الحفظ'});}catch(e){res.status(e.status||400).json({message:e.message||'فشل الحفظ'})}});
module.exports=router;
