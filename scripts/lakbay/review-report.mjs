import fs from "node:fs";
import {getAdmin,argValue} from "./_core.mjs";
const db=getAdmin();
const province=argValue("province");
const count=Math.max(1,Math.min(5000,Number(argValue("limit","500"))||500));
let query=db.from("lakbay_destinations")
  .select("id,name,province,city,category,latitude,longitude,source_url,review_status")
  .eq("review_status","pending").order("created_at",{ascending:false}).limit(count);
if(province)query=query.eq("province",province);
const {data,error}=await query;
if(error)throw new Error(error.message);
const keys=["id","name","province","city","category","latitude","longitude","source_url","review_status"];
const q=value=>`"${String(value??"").replaceAll('"','""')}"`;
const csv=[keys.join(","),...(data||[]).map(row=>keys.map(k=>q(row[k])).join(","))].join("\r\n");
fs.mkdirSync("reports",{recursive:true});
const output=`reports/lakbay-review-${province.replace(/[^a-z0-9]/gi,"-")||"all"}.csv`;
fs.writeFileSync(output,csv,"utf8");
console.log(`Exported ${data?.length||0} records into ${output}. No records were approved or modified.`);
