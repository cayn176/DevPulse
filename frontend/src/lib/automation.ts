import {request} from './api'

export type WorkflowValues = {name:string;project_id:string|null;action:'task'|'git_review';instructions:string;enabled:boolean}
export type Workflow = WorkflowValues & {id:string}
export type WorkflowRun = {id:string;workflow_id:string|null;name:string;task_id:string|null;output:string;created_at:string}
export type Preview = {text:string;revision:string}
export type TaskStatus = 'backlog'|'todo'|'in_progress'|'review'|'done'
export type TaskPriority = 'low'|'normal'|'high'|'urgent'
export type TaskValues = {due_date?:string|null;labels?:string;text:string;description:string;project_id:string|null;status:TaskStatus;priority:TaskPriority}
export type Task = TaskValues & {history?:{time:string;fields:string[]}[];id:string;done:boolean;created_at:string}

const root='/api/local-work'
const write=(method:string,body?:unknown):RequestInit=>({method,...(body===undefined?{}:{body:JSON.stringify(body)})})
export const automation={
  workflows:()=>request<Workflow[]>(root+'/workflows'),
  save:(values:WorkflowValues,id?:string)=>request<Workflow>(root+'/workflows'+(id?'/'+id:''),write(id?'PUT':'POST',values)),
  remove:(id:string)=>request(root+'/workflows/'+id,write('DELETE')),
  runs:()=>request<WorkflowRun[]>(root+'/runs'),
  preview:(id:string)=>request<Preview>(root+'/workflows/'+id+'/preview'),
  execute:(id:string,revision:string,requestId:string)=>request<WorkflowRun>(root+'/workflows/'+id+'/run',write('POST',{revision,request_id:requestId,confirm:true})),
  tasks:()=>request<Task[]>(root+'/tasks'),
  addTask:(text:string)=>request<Task>(root+'/tasks',write('POST',{text})),
  updateTask:(id:string,done:boolean)=>request<Task>(root+'/tasks/'+id,write('PATCH',{done})),
  saveTask:(values:TaskValues,id?:string)=>request<Task>(root+'/tasks'+(id?'/'+id:''),write(id?'PATCH':'POST',values)),
  removeTask:(id:string)=>request(root+'/tasks/'+id,write('DELETE'))
}
