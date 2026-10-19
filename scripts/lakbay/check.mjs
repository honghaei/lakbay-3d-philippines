import {getAdmin} from "./_core.mjs";
const db=getAdmin();
for (const table of ["lakbay_areas","lakbay_destinations","lakbay_photos"]) {
  const {count,error}=await db.from(table).select("*",{count:"exact",head:true});
  if(error)throw new Error(`${table}: ${error.message}`);
  console.log(`${table}: ${count}`);
}
for (const status of ["approved","pending","rejected"]) {
  const {count,error}=await db.from("lakbay_destinations").select("*",{head:true,count:"exact"}).eq("review_status",status);
  if(error)throw new Error(error.message);
  console.log(`Destinations ${status}: ${count}`);
}
