const mongoose = require('mongoose');
const schema = new mongoose.Schema({applicationId:{type:mongoose.Schema.Types.ObjectId,ref:'Application',default:null,index:true},macAddress:{type:String,required:true},deviceName:{type:String,default:''},deviceType:{type:String,default:'mac'},isBlocked:{type:Boolean,default:false},userId:{type:mongoose.Schema.Types.ObjectId,ref:'MacUser',default:null},lastSeen:{type:Date,default:null},metadata:{type:mongoose.Schema.Types.Mixed,default:{}}},{timestamps:true});
schema.index({applicationId:1,macAddress:1},{unique:true});
module.exports=mongoose.model('DeviceMac',schema);
