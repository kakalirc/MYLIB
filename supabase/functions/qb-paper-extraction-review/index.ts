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
 if(action==="get_settings"||action==="save_settings"){
  const {data:existing,error:settingsError}=await db.from("qb_paper_extraction_settings").select("max_pdf_mb,max_pages,budget_usd").eq("id",1).maybeSingle();
  if(settingsError||!existing)return reply(500,{error:"Question Bank extraction settings are unavailable. Apply the extraction settings migration first."});
  if(action==="get_settings")return reply(200,{ok:true,settings:{max_pdf_mb:existing.max_pdf_mb,max_pages:existing.max_pages,budget_usd:Number(existing.budget_usd)}});
  const next=body.settings||{},maxPdfMb=Number(next.max_pdf_mb),maxPages=Number(next.max_pages),budgetUsd=Number(next.budget_usd);
  if(!Number.isInteger(maxPdfMb)||maxPdfMb<1||maxPdfMb>100)return reply(400,{error:"PDF size must be a whole number from 1 to 100 MB."});
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>200)return reply(400,{error:"Page limit must be a whole number from 1 to 200."});
  if(!Number.isFinite(budgetUsd)||budgetUsd<=0||budgetUsd>1000)return reply(400,{error:"Budget must be greater than $0 and no more than $1,000 USD."});
  const {data:saved,error:saveError}=await db.from("qb_paper_extraction_settings").update({max_pdf_mb:maxPdfMb,max_pages:maxPages,budget_usd:budgetUsd,updated_at:new Date().toISOString(),updated_by:auth.user.id}).eq("id",1).select("max_pdf_mb,max_pages,budget_usd").single();
  if(saveError||!saved)return reply(500,{error:"Could not save extraction settings."});
  return reply(200,{ok:true,settings:{max_pdf_mb:saved.max_pdf_mb,max_pages:saved.max_pages,budget_usd:Number(saved.budget_usd)}});
 }
 if(action==="latest"){
  const sourceId=String(body.source_paper_id||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId))return reply(400,{error:"Valid source_paper_id required."});
  const {data:latest,error}=await db.from("qb_paper_extraction_runs").select("id,source_paper_id,status,ai_request_state,current_stage,input_tokens,output_tokens,model_name,started_at,completed_at,lease_expires_at,actual_cost_usd,estimated_cost_usd,cost_currency,cost_budget_usd,input_price_usd_per_million,output_price_usd_per_million,admin_reconciled_at,admin_reconciliation_note").eq("source_paper_id",sourceId).order("started_at",{ascending:false}).limit(1).maybeSingle();
  if(error)return reply(500,{error:"Could not load extraction history."});
  return reply(200,{ok:true,found:!!latest,run:latest||null});
 }
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId))return reply(400,{error:"Valid run_id required."});
 const {data:run,error:runError}=await db.from("qb_paper_extraction_runs").select("id,source_paper_id,status,ai_request_state,current_stage,input_tokens,output_tokens,model_name,started_at,completed_at,actual_cost_usd,estimated_cost_usd,cost_currency,cost_budget_usd,input_price_usd_per_million,output_price_usd_per_million").eq("id",runId).maybeSingle();
 if(runError||!run)return reply(404,{error:"Extraction run not found."});
 if(action==="inspect_reconciliation"){
  const [{data:requests,error:requestError},{data:pages,error:pageError}]=await Promise.all([
   db.from("qb_paper_extraction_requests").select("id,chunk_key,provider,model_name,request_state,provider_request_id,sent_at,responded_at,input_tokens,output_tokens,total_cost_usd,error_message").eq("run_id",runId).order("created_at"),
   db.from("qb_paper_extraction_pages").select("page_number,page_state,page_kind,error_message,completed_at").eq("run_id",runId).order("page_number")
  ]);
  if(requestError||pageError)return reply(500,{error:"Could not inspect provider request and page checkpoint history."});
  return reply(200,{ok:true,run,reconciliation_required:run.ai_request_state==="uncertain"|| (requests||[]).some((x:any)=>["sent","uncertain"].includes(x.request_state)),requests:requests||[],pages:pages||[]});
 }
 if(action==="reconcile_uncertain"){
  if(body.confirm_provider_outcome_unknown!==true)return reply(400,{error:"Explicit confirmation that the provider outcome remains unknown is required."});
  const note=String(body.reconciliation_note||"").trim();
  if(note.length<15)return reply(400,{error:"Provide an audit note of at least 15 characters explaining why this attempt is being reconciled."});
  if(!["uncertain","failed"].includes(run.status)||run.ai_request_state!=="uncertain")
   return reply(409,{error:"Only an uncertain provider attempt can be reconciled through this action."});
  const {data:requests,error:requestError}=await db.from("qb_paper_extraction_requests")
   .select("id,request_state,response_payload").eq("run_id",runId);
  if(requestError)return reply(500,{error:"Could not verify provider request history."});
  if(!(requests||[]).some((x:any)=>["sent","uncertain"].includes(x.request_state)))
   return reply(409,{error:"No ambiguous provider request was found; reconciliation is not applicable."});
  const {data:updated,error:updateError}=await db.from("qb_paper_extraction_runs")
   .update({admin_reconciled_at:new Date().toISOString(),admin_reconciled_by:auth.user.id,admin_reconciliation_note:note.slice(0,1200)})
   .eq("id",runId).is("admin_reconciled_at",null).eq("status",run.status).eq("ai_request_state","uncertain")
   .select("id,admin_reconciled_at,admin_reconciled_by,admin_reconciliation_note").maybeSingle();
  if(updateError||!updated)return reply(409,{error:"The run changed while reconciliation was being saved. Refresh and inspect it again."});
  return reply(200,{ok:true,reconciled:true,run_id:runId,reconciliation:updated,
   warning:"The original provider outcome remains unknown. A future extraction may incur a duplicate provider charge. The original request and run records have not been deleted or rewritten."});
 }
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
