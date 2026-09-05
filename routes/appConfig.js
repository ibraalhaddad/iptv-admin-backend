const express = require('express');
const Setting = require('../models/Setting');
const Banner = require('../models/Banner');
const Application = require('../models/Application');
const { THEMES } = require('./themes');

const router = express.Router();

function appFilter(req) {
  const raw = req.query.applicationId || req.headers['x-application-id'] || null;
  return raw ? { applicationId: raw } : { applicationId: null };
}

async function getApplication(req) {
  const raw = req.query.applicationId || req.headers['x-application-id'] || null;
  if (!raw) return null;
  return Application.findById(raw).select('_id name slug description logoUrl isActive').lean();
}

function absoluteUrl(req, value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${req.protocol}://${req.get('host')}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

router.get('/theme', async (req,res)=>{
  try {
    const row=await Setting.findOne({...appFilter(req),key:'active_theme_id'});
    res.json({themeId:row?.value||THEMES[0].themeId});
  } catch(e) { res.status(500).json({message:'failed'}); }
});

router.get('/banners', async (req,res)=>{
  try {
    const now=new Date();
    const banners=await Banner.find({...appFilter(req),isActive:true,$and:[{$or:[{startAt:null},{startAt:{$lte:now}}]},{$or:[{endAt:null},{endAt:{$gte:now}}]}]}).sort({sortOrder:1,createdAt:-1});
    res.json({banners});
  } catch(e) { res.status(500).json({message:'failed'}); }
});

router.get('/home', async (req,res)=>{
  try {
    const now=new Date();
    const filter=appFilter(req);
    const [themeRow,banners,application,settingRows]=await Promise.all([
      Setting.findOne({...filter,key:'active_theme_id'}),
      Banner.find({...filter,isActive:true,$and:[{$or:[{startAt:null},{startAt:{$lte:now}}]},{$or:[{endAt:null},{endAt:{$gte:now}}]}]}).sort({sortOrder:1,createdAt:-1}),
      getApplication(req),
      Setting.find(filter).lean(),
    ]);

    const settings = {};
    for (const row of settingRows) settings[row.key] = row.value;

    if (application) application.logoUrl = absoluteUrl(req, application.logoUrl);

    res.json({
      success: true,
      applicationId: req.query.applicationId || req.headers['x-application-id'] || null,
      application,
      settings: { ...settings, active_theme_id: themeRow?.value || settings.active_theme_id || THEMES[0].themeId },
      banners,
      themeId: themeRow?.value||THEMES[0].themeId,
    });
  } catch(e) {
    console.error('[APP-CONFIG] home', e);
    res.status(500).json({message:'failed'});
  }
});

module.exports=router;
