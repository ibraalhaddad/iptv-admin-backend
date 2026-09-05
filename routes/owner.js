const express=require('express'); const OwnerProfile=require('../models/OwnerProfile'); const {auth,requireRole}=require('../middleware/auth');
const router=express.Router(); router.use(auth,requireRole('super_admin'));
router.get('/',async(req,res)=>{let o=await OwnerProfile.findOne();if(!o)o=await OwnerProfile.create({});res.json(o);});
router.put('/',async(req,res)=>{let o=await OwnerProfile.findOne();if(!o)o=new OwnerProfile();Object.assign(o,req.body);await o.save();res.json(o);}); module.exports=router;
