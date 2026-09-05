const express = require('express');
const { auth, requirePermission, scopeFilter } = require('../middleware/auth');
const Entity=require('../models/Entity'); const DeviceMac=require('../models/DeviceMac'); const MacUser=require('../models/MacUser'); const Application=require('../models/Application'); const Banner=require('../models/Banner');
const router=express.Router();
router.get('/',auth,requirePermission('dashboard.view'),async(req,res)=>{
  const filter=scopeFilter(req);
  const [users,packages,hosts,lines,devices,macUsers,applications,banners]=await Promise.all([
    Entity.countDocuments({...filter,type:'users'}),Entity.countDocuments({...filter,type:'packages'}),Entity.countDocuments({...filter,type:'hosts'}),Entity.find({...filter,type:'lines'}).lean(),DeviceMac.countDocuments(filter),MacUser.countDocuments(filter),req.user.role==='super_admin'?Application.countDocuments():Promise.resolve(0),Banner.countDocuments({...filter,isActive:true})
  ]);
  res.json({totalUsers:users,totalPackages:packages,totalHosts:hosts,activeLines:lines.filter(x=>x.data?.status==='active').length,expiredLines:lines.filter(x=>x.data?.status==='expired').length,suspendedLines:lines.filter(x=>x.data?.status==='suspended').length,totalDevices:devices+macUsers,macUsers,totalApplications:applications,activeBanners:banners});
});
module.exports=router;
