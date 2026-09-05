const mongoose = require('mongoose');
const schema = new mongoose.Schema({ applicationId:{type:mongoose.Schema.Types.ObjectId,ref:'Application',default:null,index:true}, key:{type:String,index:true}, value:mongoose.Schema.Types.Mixed },{timestamps:true});
schema.index({applicationId:1,key:1},{unique:true});
module.exports = mongoose.model('Setting',schema);
