const mongoose = require('mongoose');
const deviceSchema = new mongoose.Schema({
 deviceId:{type:String,required:true}, deviceName:{type:String,default:''}, deviceType:{type:String,enum:['mac','iphone','ipad','android','android_tv','other'],default:'mac'}, macAddress:{type:String,default:''}, model:{type:String,default:''}, osVersion:{type:String,default:''}, appVersion:{type:String,default:''}, ipAddress:{type:String,default:''}, lastSeen:{type:Date,default:null}, isActive:{type:Boolean,default:true}
},{_id:true});
const schema = new mongoose.Schema({
 applicationId:{type:mongoose.Schema.Types.ObjectId,ref:'Application',default:null,index:true},
 username:{type:String,required:true}, name:{type:String,default:''}, email:{type:String,default:''}, phone:{type:String,default:''}, passwordHash:{type:String,default:''}, isActive:{type:Boolean,default:true}, notes:{type:String,default:''}, devices:{type:[deviceSchema],default:[]}
},{timestamps:true});
schema.index({applicationId:1,username:1},{unique:true});
module.exports = mongoose.model('MacUser',schema);
