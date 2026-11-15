// Admin-only resumable Question Bank paper extraction worker.
// Each two-page provider request is persisted before transmission. A sent/uncertain
// request is never resent; saved responses are reused to rebuild staging.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { parseQuestionItems } from "./response_parser.ts";
import { readAnthropicUsage } from "./usage_reconciliation.ts";

const MODEL=Deno.env.get("QB_EXTRACTION_MODEL")||"claude-haiku-4-5";
const PRICING:Record<string,{input:number;output:number;source:string}>={
 "claude-haiku-4-5":{input:1,output:5,source:"Anthropic Claude API standard pricing; USD per million tokens"}
};
const PRICE=PRICING[MODEL];
let BUDGET_USD=2;
let MAX_PDF_MB=20, MAX_PAGES=25, MAX_BYTES=20*1024*1024;
const MAX_OUTPUT_TOKENS=32000;
const MAX_BATCH_RESERVE_USD=(200000*(PRICE?.input||0)+MAX_OUTPUT_TOKENS*(PRICE?.output||0))/1_000_000;
const BATCH=1;
const usd=(n:number)=>Math.round((n+Number.EPSILON)*1e8)/1e8;
const tokenCost=(input:number,output:number)=>usd(input*(PRICE?.input||0)/1_000_000+output*(PRICE?.output||0)/1_000_000);
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(s:number,b:unknown)=>new Response(JSON.stringify(b),{status:s,headers:{...CORS,"Content-Type":"application/json"}});
const hash=async(s:string)=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");};
const b64=(a:Uint8Array)=>{let s="";for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s);};
function parseJson(s:string){return parseQuestionItems(s);}
function parseProviderBody(raw:string){
 const data=JSON.parse(raw);
 if(data.error)throw new Error(data.error.message||"Anthropic returned an error.");
 const text=(data.content||[]).filter((x:any)=>x.type==="text").map((x:any)=>x.text).join("\n");
 if(!text)throw new Error("Provider response contained no text content.");
 return {data,text};
}
function parseSavedResponse(payload:any){
 if(payload?.items&&Array.isArray(payload.items))return payload;
 if(typeof payload?.raw_text==="string"){
  const parsed=parseJson(payload.raw_text);
  return {items:parsed.items};
 }
 if(typeof payload?.raw_body==="string"){
  const {text}=parseProviderBody(payload.raw_body);
  const parsed=parseJson(text);
  return {items:parsed.items};
 }
 throw new Error("Saved provider response is not recoverable; do not resend automatically.");
}
function prompt(a:number,z:number){return `Extract ONLY examinable questions and their source passages from the SINGLE original PDF page ${a}. The supplied PDF contains exactly one page. Accuracy and completeness are both essential. Transcribe every legible question, option, subpart, mark and relevant instruction exactly in the source language. Never invent, paraphrase, answer, translate or silently omit unclear content; mark uncertain text with [unclear] and explain it in extraction_notes.

Return ONLY JSON using this exact outer structure: {"items":[{"item_kind":"question"|"passage","page_number":1,"original_number":null,"parent_item_key":null,"payload":{...}}]}. Every item MUST have a non-empty payload object. Put all question/passage content fields inside payload; keep only item_kind, page_number, original_number and parent_item_key outside payload. Allowed item_kind values are ONLY "question" and "passage". NEVER emit headers, paper titles, page furniture, section headings, general instructions, marks summaries, or images as standalone items. Preserve section names, shared instructions and marks as metadata on the relevant question.

PASSAGES: Emit each complete unseen/comprehension/source passage once as one passage item with passage_text, passage_type, original_number and page_number. Preserve paragraph breaks. Questions that refer to it must set parent_item_key to that passage original_number exactly.

QUESTIONS: Emit one item per main numbered question. Keep ALL subquestions/subparts together inside payload.subquestions as an ordered array; do not emit subparts as separate top-level items. Each subquestion includes original_number (e.g. a, b, i, ii), question_text, options (array or null), marks (number or null), question_type and visual_stimulus_description. Parent payload includes question_text, question_type, options, marks, section, section_label, shared_instructions, topic, difficulty, answer_text=null, explanation_text=null, subquestions, extraction_notes. If no subparts, use an empty subquestions array. Preserve exact numbering and order; do not combine separate main questions.

PICTURE COMPOSITION / DIAGRAMS / MAPS / GRAPHS / CARTOONS: Keep the complete prompt as a question. Set visual_stimulus_required=true and provide a detailed objective visual_stimulus_description covering relevant visible elements, labels, relationships and layout. Include visual_stimulus_page_numbers. Do not claim an image file was extracted; the original PDF page remains the source image. If the question cannot be answered without the picture, flag it in extraction_notes.

UNSEEN PASSAGES: Keep the passage as one passage item and group every associated comprehension question and subpart under its parent question, linked by parent_item_key. Do not repeat passage text in each question. Do not attach unrelated questions to it.

PAGE NUMBERS: page_number MUST be the integer 1 for EVERY item because this request contains exactly one original PDF page. Do not use a printed page number visible in the document. The worker assigns the original PDF page number independently. If a question or passage continues across pages, use its first page number and preserve all continued text. Blank pages produce no items.`;}

function validateExtractedItem(item:any){
 const payload=item?.payload&&typeof item.payload==="object"?item.payload:item;
 if(item.item_kind==="question" && !String(payload.question_text||"").trim() && !(Array.isArray(payload.subquestions)&&payload.subquestions.length))
  throw new Error("Question item has no question text or subquestions; staging was blocked.");
 if(item.item_kind==="passage"){
  const passage=String(payload.passage_text||"").trim();
  if(!passage)throw new Error("Passage item has no passage_text; staging was blocked.");
  if(passage.toLowerCase().includes("[content from") || passage.toLowerCase().includes("appears to contain text beginning"))
   throw new Error("Passage contains explanatory placeholder text instead of source transcription; staging was blocked.");
 }
}
function normalizePayload(item:any,page:number){
 const payload=item.payload&&typeof item.payload==="object"?{...item.payload}:{raw:item};
 if(item.item_kind!=="question")return payload;
 const parts=Array.isArray(payload.subquestions)?payload.subquestions:[];
 const rendered=parts.map((part:any)=>[
  part.original_number?String(part.original_number)+") ":"",
  String(part.question_text||""),
  Array.isArray(part.options)&&part.options.length?"Options: "+part.options.join(" | "):"",
  part.marks!=null?"("+part.marks+" marks)":""
 ].filter(Boolean).join(" ")).join("\n");
 const visual=payload.visual_stimulus_description?"[Visual stimulus: "+payload.visual_stimulus_description+"]":"";
 const shared=payload.shared_instructions?"[Shared instructions: "+payload.shared_instructions+"]":"";
 payload.question_text=[payload.question_text||"",rendered,visual,shared].filter(Boolean).join("\n");
 return payload;
}
async function adminUser(db:any,token:string){if(!token)throw new Error("Please sign in again.");const {data,error}=await db.auth.getUser(token);if(error||!data?.user)throw new Error("Please sign in again.");const {data:p,error:pe}=await db.from("profiles").select("role,archived").eq("id",data.user.id).maybeSingle();if(pe||p?.role!=="Admin"||p.archived===true)throw new Error("Only an active Admin can extract papers.");return data.user;}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 if(req.method!=="POST")return reply(405,{error:"Use POST."});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return reply(500,{error:"Server configuration is incomplete."});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 let user:any,body:any;
 try{user=await adminUser(db,(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,""));body=await req.json();}
 catch(e){return reply(401,{error:(e as Error).message});}
 const {data:extractionSettings,error:settingsError}=await db.from("qb_paper_extraction_settings").select("max_pdf_mb,max_pages,budget_usd").eq("id",1).maybeSingle();
 if(settingsError||!extractionSettings)return reply(500,{error:"Question Bank extraction settings are unavailable. Apply the extraction settings migration first."});
 MAX_PDF_MB=Number(extractionSettings.max_pdf_mb);MAX_PAGES=Number(extractionSettings.max_pages);BUDGET_USD=Number(extractionSettings.budget_usd);
 if(!Number.isInteger(MAX_PDF_MB)||MAX_PDF_MB<1||MAX_PDF_MB>100||!Number.isInteger(MAX_PAGES)||MAX_PAGES<1||MAX_PAGES>200||!Number.isFinite(BUDGET_USD)||BUDGET_USD<=0||BUDGET_USD>1000)return reply(500,{error:"Question Bank extraction settings are invalid."});
 MAX_BYTES=MAX_PDF_MB*1024*1024;
 const runId=String(body.run_id||"");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId))return reply(400,{error:"Valid run_id required."});
 const owner=crypto.randomUUID();
 const {data:lease,error:le}=await db.rpc("qb_claim_extraction_worker",{p_run_id:runId,p_lease_owner:owner,p_lease_seconds:900});
 if(le)return reply(500,{error:"Could not claim extraction worker lease."});
 if(!lease?.ok)return reply(409,{ok:false,...lease});
 try{
  const {data:run,error:re}=await db.from("qb_paper_extraction_runs").select("id,source_paper_id,status,ai_request_state,pdf_sha256,accounting_warnings").eq("id",runId).maybeSingle();
  if(re||!run)throw new Error("Extraction run not found.");
  // Ambiguous chunks remain immutable and are skipped; later independent page batches may continue.
  if(!PRICE)throw new Error("No USD pricing is configured for model "+MODEL+"; no provider request was made.");
  const {error:priceSnapshotError}=await db.from("qb_paper_extraction_runs").update({
   model_name:MODEL,input_price_usd_per_million:PRICE.input,output_price_usd_per_million:PRICE.output,
   cost_currency:"USD",cost_budget_usd:BUDGET_USD,pricing_source:PRICE.source,pricing_checked_at:new Date().toISOString()
  }).eq("id",runId);
  if(priceSnapshotError)throw new Error("Could not persist USD pricing and budget before provider use.");
  const {data:paper,error:pe}=await db.from("qb_source_papers").select("id,status,stored_pdf_url").eq("id",run.source_paper_id).maybeSingle();
  if(pe||!paper||paper.status!=="published")throw new Error("Source paper is unavailable or no longer published.");
  const {data:ai,error:ae}=await db.from("ai_settings").select("api_key,master_enabled").eq("id",1).maybeSingle();
  if(ae||!ai?.api_key||ai.master_enabled===false)throw new Error("AI is unavailable or disabled in AI Settings.");
  let path=String(paper.stored_pdf_url||"").replace(/^qb-papers\//,"");
  if(path===paper.stored_pdf_url){try{const u=new URL(path);const m=u.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/qb-papers\/(.+)$/);path=m?decodeURIComponent(m[1]):"";}catch{path="";}}
  if(!path||path.includes(".."))throw new Error("PDF must be stored in the private qb-papers bucket.");
  const {data:file,error:de}=await db.storage.from("qb-papers").download(path);
  if(de||!file)throw new Error("Could not download source PDF.");
  if(file.size>MAX_BYTES)throw new Error("PDF exceeds the configured "+MAX_PDF_MB+" MB extraction limit; no provider request was made.");
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw new Error("Stored file is not a valid PDF.");
  if(run.pdf_sha256) {
    const digest=await crypto.subtle.digest("SHA-256",bytes);
    const actual=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
    if(run.pdf_sha256!==actual)throw new Error("PDF checksum changed after preflight.");
  }
  const pdf=await PDFDocument.load(bytes,{ignoreEncryption:false,updateMetadata:false});
  const total=pdf.getPageCount();
  if(total<1||total>MAX_PAGES)throw new Error(`PDF has ${total} pages; the configured limit is ${MAX_PAGES} pages per paper.`);
  const seed=await db.from("qb_paper_extraction_pages").upsert(Array.from({length:total},(_,i)=>({run_id:runId,page_number:i+1,page_state:"pending",page_kind:"unknown"})),{onConflict:"run_id,page_number",ignoreDuplicates:true});
  if(seed.error)throw new Error("Could not initialise page checkpoints.");
  const {data:requests,error:qe}=await db.from("qb_paper_extraction_requests").select("id,chunk_key,request_state,response_payload,provider_request_id,sent_at,input_tokens,output_tokens,input_cost_usd,output_cost_usd,total_cost_usd").eq("run_id",runId);
  if(qe)throw new Error("Could not inspect provider checkpoints.");
  const accountingWarnings:string[]=Array.isArray(run.accounting_warnings)?run.accounting_warnings.map((x:any)=>String(x)):[];
  const accountingWarning=async(stage:string,message:string,chunk:string)=>{
   const warning={run_id:runId,chunk_key:chunk,stage,message,at:new Date().toISOString()};
   accountingWarnings.push(`${stage} (${chunk}): ${message}`);
   console.error("[QB_EXTRACTION_ACCOUNTING_WARNING]",JSON.stringify(warning));
   const {error}=await db.from("qb_paper_extraction_runs").update({accounting_warnings:accountingWarnings}).eq("id",runId).eq("lease_owner",owner);
   if(error)console.error("[QB_EXTRACTION_ACCOUNTING_WARNING_PERSIST_FAILED]",JSON.stringify({run_id:runId,chunk_key:chunk,message:error.message}));
  };
  // A responded request is immutable at the payload level. Rebuild usage metadata
  // from its durable raw Anthropic body, then update only the dedicated ledger columns.
  // This makes the repair repeatable and never requires another provider call.
  for(const request of (requests||[]).filter((x:any)=>x.request_state==="responded")){
   const rawBody=request.response_payload?.raw_body;
   if(typeof rawBody==="string"){
    let usage:any=null;
    try{usage=readAnthropicUsage(rawBody,PRICE.input,PRICE.output);}
    catch(e){await accountingWarning("usage_reconstruction",String((e as Error).message||e),request.chunk_key);continue;}
    const {error:reconcileError}=await db.from("qb_paper_extraction_requests").update({
     provider_request_id:usage.providerRequestId||request.provider_request_id,
     input_tokens:usage.inputTokens,output_tokens:usage.outputTokens,
     input_cost_usd:usage.inputCostUsd,output_cost_usd:usage.outputCostUsd,
     total_cost_usd:usage.totalCostUsd
    }).eq("id",request.id).eq("request_state","responded");
    if(reconcileError){await accountingWarning("request_usage_update",reconcileError.message,request.chunk_key);}
    else Object.assign(request,{provider_request_id:usage.providerRequestId||request.provider_request_id,
     input_tokens:usage.inputTokens,output_tokens:usage.outputTokens,
     input_cost_usd:usage.inputCostUsd,output_cost_usd:usage.outputCostUsd,total_cost_usd:usage.totalCostUsd});
   }else if(request.input_tokens==null||request.output_tokens==null||request.total_cost_usd==null){
    await accountingWarning("usage_reconstruction","Saved response has no recoverable usage fields; extraction will continue without verified cost.",request.chunk_key);
   }
  }
  // Rebuild staging from every durable provider response before deciding which pages need work.
  // Anthropic sees a two-page PDF fragment and commonly numbers its pages locally (1, 2),
  // so normalize those local numbers to the original PDF page range.
  const respondedByChunk=new Map<string,any>();
  for(const request of (requests||[]).filter((x:any)=>x.request_state==="responded")){
   const match=String(request.chunk_key||"").match(/^pages:(\d+)-(\d+):/);
   if(!match || !String(request.chunk_key||"").endsWith(":v5"))continue;
   const first=Number(match[1]),last=Number(match[2]),canonicalChunk=`pages:${first}-${last}:v5`;
   const prior=respondedByChunk.get(canonicalChunk);
   if(!prior||String(request.sent_at||"")>String(prior.sent_at||""))respondedByChunk.set(canonicalChunk,request);
  }
  for(const [chunk,request] of [...respondedByChunk.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}))){
   const match=chunk.match(/^pages:(\d+)-(\d+):/);
   if(!match || !String(chunk).endsWith(":v5"))continue;
   const first=Number(match[1]),last=Number(match[2]);
   const parsed=parseSavedResponse(request.response_payload);
   let savedCount=0;
   for(let i=0;i<(parsed.items||[]).length;i++){
    const item=parsed.items[i];if(!item||!["question","passage"].includes(item.item_kind))continue;validateExtractedItem(item);
    const reportedPage=Number(item.page_number);
    if(BATCH===1 && reportedPage!==1)throw new Error("AI returned a non-local page number for a single-page request. The response is retained, but staging is blocked to prevent incorrect page attribution.");
    const page=first;
    const payload=normalizePayload(item,page);
    const fingerprint=await hash(JSON.stringify(item));
    const {error:se}=await db.from("qb_paper_extraction_staging").upsert({
     run_id:runId,item_key:`${chunk}:item:${i+1}`,item_kind:item.item_kind,page_number:page,
     original_number:item.original_number==null?null:String(item.original_number),
     parent_item_key:item.parent_item_key==null?null:String(item.parent_item_key),
     payload,content_fingerprint:fingerprint,review_state:"pending"
    },{onConflict:"run_id,item_key"});
    if(se)throw new Error("Could not rebuild staging from a saved provider response; no provider request was sent.");
    savedCount++;
   }
   const {error:pageRepairError}=await db.from("qb_paper_extraction_pages").update({
    page_state:"completed",page_kind:"mixed",completed_at:request.responded_at||new Date().toISOString(),
    error_message:null,page_metadata:{chunk_key:chunk,staged_items:savedCount,recovered_from_saved_response:true}
   }).eq("run_id",runId).gte("page_number",first).lte("page_number",last);
   if(pageRepairError)throw new Error("Could not repair page checkpoints from the saved provider response.");
  }
  const ambiguousRequests=(requests||[]).filter((x:any)=>["sent","uncertain"].includes(x.request_state));
  for(const request of ambiguousRequests){
   const match=String(request.chunk_key||"").match(/^pages:(\d+)-(\d+):/);
   if(!match || !String(request.chunk_key||"").endsWith(":v5"))continue;
   const first=Number(match[1]),last=Number(match[2]);
   const {error:pendingError}=await db.from("qb_paper_extraction_pages").update({page_state:"pending",error_message:"Provider outcome is ambiguous; an audited retry is required.",page_metadata:{chunk_key:request.chunk_key,reason:"ambiguous_provider_outcome",retry_policy:"initial_plus_two"}}).eq("run_id",runId).gte("page_number",first).lte("page_number",last).neq("page_state","completed");
   if(pendingError)throw new Error("Could not restore pages for controlled retry.");
   if(request.request_state==="sent")await db.from("qb_paper_extraction_requests").update({request_state:"uncertain",error_message:"Provider outcome is ambiguous; retained for audit and eligible for a separately recorded retry."}).eq("id",request.id).eq("request_state","sent");
  }
  if(ambiguousRequests.length){
   const {data:state,error:stateError}=await db.rpc("qb_set_extraction_worker_state",{p_run_id:runId,p_lease_owner:owner,p_status:"processing",p_ai_request_state:"responded",p_error_message:"One or more provider chunks remain ambiguous and were skipped; later independent batches may continue."});
   if(stateError||!state?.ok)throw new Error("Could not advance run state while preserving ambiguous provider requests.");
  }
  const byChunk=new Map((requests||[]).map((x:any)=>[x.chunk_key,x]));
  let staged=0,input=0,output=0,totalCost=0;
  for(const r of (requests||[]).filter((x:any)=>x.request_state==="responded")){input+=Number(r.input_tokens||0);output+=Number(r.output_tokens||0);totalCost=usd(totalCost+(r.total_cost_usd==null?tokenCost(Number(r.input_tokens||0),Number(r.output_tokens||0)):Number(r.total_cost_usd)));}
  const {data:pageStates,error:pageStatesError}=await db.from("qb_paper_extraction_pages").select("page_number,page_state").eq("run_id",runId).order("page_number");
  if(pageStatesError)throw new Error("Could not inspect page checkpoints.");
  const nextPage=(pageStates||[]).find((p:any)=>!["completed","skipped"].includes(p.page_state))?.page_number;
  for(let first=nextPage||total+1;first<=total;first+=BATCH){
   const {data:batchLease,error:batchLeaseError}=await db.rpc("qb_renew_extraction_worker",{p_run_id:runId,p_lease_owner:owner,p_lease_seconds:900});
   if(batchLeaseError||batchLease!==true)throw new Error("Worker lease was lost before the next batch; this worker stopped without sending another provider request.");
   const last=Math.min(total,first+BATCH-1),chunk=`pages:${first}-${last}:v5`;
   const attempts=(requests||[]).filter((r:any)=>r.chunk_key===chunk||String(r.chunk_key||"").startsWith(chunk+":retry"));
   const savedAttempt:any=attempts.filter((r:any)=>r.request_state==="responded").sort((a:any,b:any)=>String(b.sent_at||"").localeCompare(String(a.sent_at||"")))[0];
   const ambiguousCount=attempts.filter((r:any)=>["sent","uncertain"].includes(r.request_state)).length;
   const retryExhausted=ambiguousCount>=3&&!savedAttempt;
   if(retryExhausted){
    await db.from("qb_paper_extraction_pages").update({page_state:"skipped",error_message:"Provider outcome remained ambiguous after the initial attempt and two automatic retries.",page_metadata:{chunk_key:chunk,reason:"retry_exhausted",attempts:ambiguousCount}}).eq("run_id",runId).gte("page_number",first).lte("page_number",last).neq("page_state","completed");
    continue;
   }
   const nextAttemptNumber=ambiguousCount===0?0:ambiguousCount;
   const requestChunk=nextAttemptNumber===0?chunk:`${chunk}:retry${nextAttemptNumber}`;
   const old:any=attempts.find((r:any)=>r.chunk_key===requestChunk&&["prepared","responded"].includes(r.request_state))||null;
   let parsed:any;
   if(savedAttempt){
    parsed=parseSavedResponse(savedAttempt.response_payload);
    const {error:resumeCostError}=await db.from("qb_paper_extraction_runs").update({input_tokens:input,output_tokens:output,actual_cost_usd:totalCost,estimated_cost_usd:totalCost,cost_budget_reserved_usd:totalCost}).eq("id",runId).eq("lease_owner",owner);
    if(resumeCostError)throw new Error("Could not reconcile saved USD usage before continuing.");
   }else{
    if(old?.request_state==="prepared"){ /* Safe to reuse: this attempt was never sent. */ }
    if(old?.request_state==="failed_before_send")throw new Error(`Pages ${first}-${last} failed before send; inspect and create an explicit retry.`);
    if(usd(totalCost+MAX_BATCH_RESERVE_USD)>BUDGET_USD)
     throw new Error(`USD spend guard stopped before pages ${first}-${last}. Actual accrued: ${totalCost.toFixed(6)}; conservative next-batch reserve: ${MAX_BATCH_RESERVE_USD.toFixed(6)}; per-paper budget: ${BUDGET_USD.toFixed(2)}.`);
    let requestId=old?.id;
    if(!requestId){
     const {data:newReq,error:ne}=await db.from("qb_paper_extraction_requests").insert({run_id:runId,chunk_key:requestChunk,provider:"anthropic",model_name:MODEL,idempotency_key:`${runId}:${requestChunk}`,request_state:"prepared",request_payload:{page_start:first,page_end:last,prompt_version:"qb-extract-v2",attempt:nextAttemptNumber+1,prior_ambiguous_attempts:ambiguousCount}}).select("id").single();
     if(ne||!newReq)throw new Error("Could not save provider request checkpoint.");
     requestId=newReq.id;
    }
    const {data:sendLease,error:sendLeaseError}=await db.rpc("qb_renew_extraction_worker",{p_run_id:runId,p_lease_owner:owner,p_lease_seconds:900});
    if(sendLeaseError||sendLease!==true)throw new Error("Worker lease was lost before provider send; no provider request was sent.");
    const {data:claim,error:ce}=await db.from("qb_paper_extraction_requests").update({request_state:"sent",sent_at:new Date().toISOString()}).eq("id",requestId).eq("request_state","prepared").select("id").maybeSingle();
    if(ce||!claim)throw new Error("Provider request is already owned or its state changed; no duplicate call was sent.");
    const state=await db.rpc("qb_set_extraction_worker_state",{p_run_id:runId,p_lease_owner:owner,p_status:"processing",p_ai_request_state:"sent",p_error_message:null});
    if(state.error||!state.data?.ok)throw new Error("Could not persist provider-send state because the worker lease is no longer valid; this request must be reconciled.");
    const part=await PDFDocument.create();
    const pages=await part.copyPages(pdf,Array.from({length:last-first+1},(_,i)=>first-1+i));pages.forEach(p=>part.addPage(p));
    let response:Response;
    let rawBody:string;
    try{
     response=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":ai.api_key,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:MODEL,max_tokens:MAX_OUTPUT_TOKENS,system:"Transcribe every legible examinable item accurately and completely. Never infer unclear text; flag uncertainty explicitly.",messages:[{role:"user",content:[{type:"document",source:{type:"base64",media_type:"application/pdf",data:b64(await part.save({useObjectStreams:false}))}},{type:"text",text:prompt(first,last)}]}]}),signal:AbortSignal.timeout(105000)});
     rawBody=await response.text();
    }catch(e){
     const msg=String((e as Error).message||e);
     await db.from("qb_paper_extraction_requests").update({request_state:"uncertain",error_message:msg.slice(0,1500)}).eq("id",requestId).eq("request_state","sent");
     await db.rpc("qb_set_extraction_worker_state",{p_run_id:runId,p_lease_owner:owner,p_status:"processing",p_ai_request_state:"uncertain",p_error_message:msg.slice(0,1500)});
     const attemptsUsed=ambiguousCount+1;
     if(attemptsUsed<3){
      return reply(200,{ok:true,run_id:runId,status:"processing",stage:"page_extraction",pages_total:total,pages_completed:(pageStates||[]).filter((p:any)=>p.page_state==="completed").length,next_page:first,retry_pending:true,retry_attempt:attemptsUsed+1,retry_limit:2,warning_message:`Pages ${first}-${last} timed out. Automatically retrying (attempt ${attemptsUsed+1} of 3); the original provider outcome may still complete.`,accounting_warnings:accountingWarnings,requires_admin_review:false,questions_published:0});
     }
     await db.from("qb_paper_extraction_pages").update({page_state:"skipped",error_message:"Provider outcome remained ambiguous after the initial attempt and two automatic retries.",page_metadata:{chunk_key:chunk,reason:"retry_exhausted",attempts:attemptsUsed}}).eq("run_id",runId).gte("page_number",first).lte("page_number",last).neq("page_state","completed");
     return reply(200,{ok:true,run_id:runId,status:"processing",stage:"page_extraction",pages_total:total,pages_completed:(pageStates||[]).filter((p:any)=>p.page_state==="completed").length,next_page:last+1,pages_skipped:[first,last],retry_exhausted:true,warning_message:`Pages ${first}-${last} remain unresolved after 2 retries and require Admin review.`,accounting_warnings:accountingWarnings,requires_admin_review:false,questions_published:0});
    }
    // Persist the complete HTTP body before parsing the provider envelope or model JSON.
    const providerRequestId=response.headers.get("request-id")||response.headers.get("x-request-id");
    const {error:rawSave}=await db.from("qb_paper_extraction_requests").update({
     request_state:"responded",response_payload:{raw_body:rawBody,http_status:response.status},
     provider_request_id:providerRequestId,responded_at:new Date().toISOString()
    }).eq("id",requestId).eq("request_state","sent");
    if(rawSave)throw new Error("Provider response received but raw response persistence failed; reconcile before any retry.");
    // The request ledger now contains a durable response. Advance run-level state
    // before parsing so the next two-page invocation can safely claim the next batch.
    const respondedState=await db.rpc("qb_set_extraction_worker_state",{p_run_id:runId,p_lease_owner:owner,p_status:"processing",p_ai_request_state:"responded",p_error_message:null});
    if(respondedState.error||!respondedState.data?.ok)throw new Error("Provider response is saved, but run state could not be advanced; resume to reconcile without resending.");
    if(!response.ok)throw new Error(`Anthropic HTTP ${response.status}: ${rawBody.slice(0,1000)}`);
    const {text}=parseProviderBody(rawBody);
    let usage:any=null;
    try{usage=readAnthropicUsage(rawBody,PRICE.input,PRICE.output);}
    catch(e){await accountingWarning("usage_reconstruction",String((e as Error).message||e),chunk);}
    const usedInput=usage?.inputTokens??0,usedOutput=usage?.outputTokens??0,batchCost=usage?.totalCostUsd??0;
    const {error:usageSave}=usage?await db.from("qb_paper_extraction_requests").update({
     provider_request_id:usage.providerRequestId||providerRequestId,
     input_tokens:usedInput,output_tokens:usedOutput,input_cost_usd:usage.inputCostUsd,
     output_cost_usd:usage.outputCostUsd,total_cost_usd:batchCost
    }).eq("id",requestId).eq("request_state","responded"): {error:null};
    if(usageSave)await accountingWarning("request_usage_update",usageSave.message,chunk);
    if(usage){input+=usedInput;output+=usedOutput;totalCost=usd(totalCost+batchCost);}
    const {error:costSave}=await db.from("qb_paper_extraction_runs").update({input_tokens:input,output_tokens:output,actual_cost_usd:totalCost,estimated_cost_usd:totalCost,cost_budget_reserved_usd:totalCost,accounting_warnings:accountingWarnings}).eq("id",runId).eq("lease_owner",owner);
    if(costSave)await accountingWarning("run_usage_update",costSave.message,chunk);
    parsed=parseJson(text);
    // Keep response_payload immutable after the first durable save. Resume reparses
    // raw_body, while token/cost metadata lives in dedicated mutable columns.
    parsed={items:parsed.items};
   }
   for(let i=0;i<(parsed.items||[]).length;i++){
    const item=parsed.items[i];if(!item||!["question","passage"].includes(item.item_kind))continue;
    const reportedPage=Number(item.page_number);
    if(BATCH===1 && reportedPage!==1)throw new Error("AI returned a non-local page number for a single-page request. The saved response is retained; staging is blocked.");
    const page=first;
    const payload=normalizePayload(item,page);
    const fingerprint=await hash(JSON.stringify(item));
    const {error:se}=await db.from("qb_paper_extraction_staging").upsert({run_id:runId,item_key:`${chunk}:item:${i+1}`,item_kind:item.item_kind,page_number:page,original_number:item.original_number==null?null:String(item.original_number),parent_item_key:item.parent_item_key==null?null:String(item.parent_item_key),payload,content_fingerprint:fingerprint,review_state:"pending"},{onConflict:"run_id,item_key"});
    if(se)throw new Error("Could not save staged item; saved provider response will be reused on resume.");
    staged++;
   }
   const {error:pu}=await db.from("qb_paper_extraction_pages").update({page_state:"completed",page_kind:"mixed",completed_at:new Date().toISOString(),page_metadata:{chunk_key:chunk,staged_items:staged}}).eq("run_id",runId).gte("page_number",first).lte("page_number",last);
   if(pu)throw new Error("Could not save page checkpoints; saved response will be reused on resume.");
   const {data:checkpointLease,error:checkpointLeaseError}=await db.rpc("qb_renew_extraction_worker",{p_run_id:runId,p_lease_owner:owner,p_lease_seconds:900});
   if(checkpointLeaseError||checkpointLease!==true)throw new Error("Worker lease was lost after saving this batch; the saved provider response and page checkpoints will be reused on resume.");
   await db.from("qb_paper_extraction_runs").update({last_checkpoint_at:new Date().toISOString(),input_tokens:input,output_tokens:output,actual_cost_usd:totalCost,estimated_cost_usd:totalCost,cost_budget_reserved_usd:totalCost}).eq("id",runId).eq("lease_owner",owner);
   const completedCount=(pageStates||[]).filter((p:any)=>p.page_state==="completed").length+(last-first+1);
   const {count:stagedTotal,error:stagedCountError}=await db.from("qb_paper_extraction_staging").select("id",{count:"exact",head:true}).eq("run_id",runId);
   if(stagedCountError)throw new Error("Could not count the durable staged items.");
   if(last<total)return reply(200,{ok:true,run_id:runId,status:"processing",stage:"page_extraction",pages_total:total,pages_completed:completedCount,pages_skipped:(pageStates||[]).filter((p:any)=>p.page_state==="skipped").length,next_page:last+1,staged_items:stagedTotal||0,input_tokens:input,output_tokens:output,model:MODEL,cost_currency:"USD",actual_cost_usd:totalCost,cost_budget_usd:BUDGET_USD,accounting_warnings:accountingWarnings,requires_admin_review:false,questions_published:0});
   break;
  }
  const {data:finalPageStates,error:finalPageStatesError}=await db.from("qb_paper_extraction_pages").select("page_number,page_state").eq("run_id",runId).order("page_number");
  if(finalPageStatesError)throw new Error("Could not verify final page checkpoints.");
  if((finalPageStates||[]).length!==total || (finalPageStates||[]).some((p:any)=>!["completed","skipped"].includes(p.page_state)))throw new Error("A page batch remains incomplete; no completion state was written.");
  const skippedPages=(finalPageStates||[]).filter((p:any)=>p.page_state==="skipped").map((p:any)=>p.page_number);
  const {count:finalStagedTotal,error:finalStagedCountError}=await db.from("qb_paper_extraction_staging").select("id",{count:"exact",head:true}).eq("run_id",runId);
  if(finalStagedCountError)throw new Error("Could not count the final durable staged items.");
  const {data:doneState,error:done}=await db.rpc("qb_set_extraction_worker_state",{p_run_id:runId,p_lease_owner:owner,p_status:"completed",p_ai_request_state:"responded",p_error_message:null});
  if(done||!doneState?.ok)throw new Error("All page responses are saved but run finalisation failed because the worker lease is no longer valid; resume to reconcile.");
  await db.from("qb_paper_extraction_runs").update({current_stage:"review",input_tokens:input,output_tokens:output,accounting_warnings:accountingWarnings, error_message:skippedPages.length?`Unresolved provider outcome; pages skipped: ${skippedPages.join(", ")}.`:null,lease_owner:null,lease_expires_at:null,heartbeat_at:new Date().toISOString(),last_checkpoint_at:new Date().toISOString()}).eq("id",runId).eq("lease_owner",owner);
  return reply(200,{ok:true,run_id:runId,status:"completed",stage:"review",pages_total:total,pages_completed:total-skippedPages.length,pages_skipped:skippedPages,staged_items:finalStagedTotal||0,input_tokens:input,output_tokens:output,model:MODEL,cost_currency:"USD",actual_cost_usd:totalCost,cost_budget_usd:BUDGET_USD,accounting_warnings:accountingWarnings,accounting_warning:accountingWarnings.length>0,provider_outcome_warning:skippedPages.length>0,warning_message:skippedPages.length?`Pages ${skippedPages.join(", ")} were skipped because their provider outcome remains unknown. No duplicate request was sent.`:null,requires_admin_review:true,questions_published:0});
 }catch(e){
  const msg=String((e as Error).message||e);
  // A stale worker must never change the state after its lease was replaced.
  await db.rpc("qb_fail_extraction_worker_if_owner",{p_run_id:runId,p_lease_owner:owner,p_error_message:msg.slice(0,1800)});
  return reply(422,{ok:false,run_id:runId,error:msg,automatic_retry:false});
 }finally{await db.rpc("qb_release_extraction_worker",{p_run_id:runId,p_lease_owner:owner});}
});
