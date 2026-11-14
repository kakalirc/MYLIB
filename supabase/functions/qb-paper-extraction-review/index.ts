// Admin-only read/review/publish API for staged Question Bank paper extraction.
import { createClient } from "npm:@supabase/supabase-js@2";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 if(req.method!=="POST")return reply(405,{error:"Use POST."});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return reply(500,{error:"Server configuration is incomplete."});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 const {data:auth,error:authError}=await db.auth.getUser(token);
 if(authError||!auth?.user)return reply(401,{error:"Please sign in again."});
 const {data:profile,error:profileError}=await db.from("profiles").select("role,archived").eq("id",auth.user.id).maybeSingle();
 if(profileError||profile?.role!=="Admin"||profile.archived===true)return reply(403,{error:"Only an active Admin can review extracted papers."});
 let body:any;try{body=await req.json();}catch{return reply(400,{error:"Invalid request JSON."});}
 const action=String(body.action||""),runId=String(body.run_id||"");
 if(action==="latest"){
  const sourceId=String(body.source_paper_id||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId))return reply(400,{error:"Valid source_paper_id required."});
  const {data:latest,error}=await db.from("qb_paper_extraction_runs").select("id,source_paper_id,status,ai_request_state,current_stage,input_tokens,output_tokens,model_name,started_at,completed_at,lease_expires_at").eq("source_paper_id",sourceId).order("started_at",{ascending:false}).limit(1).maybeSingle();
  if(error)return reply(500,{error:"Could not load extraction history."});
  return reply(200,{ok:true,found:!!latest,run:latest||null});
 }
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId))return reply(400,{error:"Valid run_id required."});
 const {data:run,error:runError}=await db.from("qb_paper_extraction_runs").select("id,source_paper_id,status,ai_request_state,current_stage,input_tokens,output_tokens,model_name,started_at,completed_at").eq("id",runId).maybeSingle();
 if(runError||!run)return reply(404,{error:"Extraction run not found."});
 if(action==="list"){
  const [{data:items,error:itemError},{data:pages,error:pageError},{data:paper}] = await Promise.all([
   db.from("qb_paper_extraction_staging").select("id,item_key,item_kind,page_number,original_number,parent_item_key,payload,review_state,review_note,published_question_id,published_passage_id").eq("run_id",runId).order("page_number").order("created_at"),
   db.from("qb_paper_extraction_pages").select("page_number,page_state,page_kind,error_message").eq("run_id",runId).order("page_number"),
   db.from("qb_source_papers").select("subject_name,year,exam_type,medium,board_id,grade_id,source_type").eq("id",run.source_paper_id).maybeSingle()
  ]);
  if(itemError||pageError)return reply(500,{error:"Could not load staged review records."});
  return reply(200,{ok:true,run,paper,items:items||[],pages:pages||[],summary:{total:(items||[]).length,questions:(items||[]).filter((x:any)=>x.item_kind==="question").length,pending:(items||[]).filter((x:any)=>["pending","edited"].includes(x.review_state)).length,approved:(items||[]).filter((x:any)=>x.review_state==="approved").length,rejected:(items||[]).filter((x:any)=>x.review_state==="rejected").length}});
 }
 if(action==="review"){
  if(run.status!=="completed"||run.current_stage!=="review")return reply(409,{error:"This extraction run is not awaiting review."});
  const itemId=String(body.item_id||""),state=String(body.review_state||"");
  if(!/^[0-9a-f-]{36}$/i.test(itemId)||!["approved","rejected","edited"].includes(state))return reply(400,{error:"Valid item_id and review_state required."});
  const patch:any={review_state:state,reviewed_by:auth.user.id,reviewed_at:new Date().toISOString(),review_note:String(body.review_note||"").slice(0,1200)};
  if(body.payload!==undefined){
   if(!body.payload||typeof body.payload!=="object"||Array.isArray(body.payload))return reply(400,{error:"Edited payload must be an object."});
   patch.payload=body.payload;
  }
  const {data:item,error}=await db.from("qb_paper_extraction_staging").update(patch).eq("id",itemId).eq("run_id",runId).is("published_question_id",null).is("published_passage_id",null).select("id,review_state,reviewed_at").maybeSingle();
  if(error||!item)return reply(409,{error:"Could not update this review item; it may already be published or belong to another run."});
  return reply(200,{ok:true,item});
 }
 if(action==="publish"){
  const {data:result,error}=await db.rpc("qb_publish_extraction_run",{p_run_id:runId,p_admin_id:auth.user.id});
  if(error)return reply(500,{error:"Atomic publication failed: "+error.message});
  if(!result?.ok)return reply(409,result);
  return reply(200,result);
 }
 return reply(400,{error:"Unsupported action. Use list, review or publish."});
});
