const mongoose = require('mongoose');
const schema = new mongoose.Schema({
 ownerName:{type:String,default:''}, email:{type:String,default:''}, phone:{type:String,default:''}, country:{type:String,default:''}, companyName:{type:String,default:''}, address:{type:String,default:''}, notes:{type:String,default:''}
},{timestamps:true});
module.exports = mongoose.model('OwnerProfile',schema);
