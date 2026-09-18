import {it,expect} from 'vitest';
import {newReview,decideReview,reviewPath} from '../../../src/team/review-store';
it('only designated owner can approve current pending ID once',()=>{
 const r=newReview(undefined,'演示确认，不部署','ou_owner');
 expect(()=>decideReview(r,r.id,'ou_other','approved')).toThrow();
 expect(()=>decideReview(r,'old','ou_owner','approved')).toThrow();
 const approved=decideReview(r,r.id,'ou_owner','approved');
 expect(approved.state).toBe('approved');
 expect(()=>decideReview(approved,r.id,'ou_owner','approved')).toThrow();
});
it('pending review cannot be overwritten and rejected request gets new ID',()=>{
 const r=newReview(undefined,'first','ou_owner');
 expect(()=>newReview(r,'replace','ou_owner')).toThrow();
 const rejected=decideReview(r,r.id,'ou_owner','rejected');
 expect(newReview(rejected,'revised','ou_owner').id).not.toBe(r.id);
});
it('isolates profile and conversation',()=>{
 expect(reviewPath('/tmp','a','oc_a')).not.toBe(reviewPath('/tmp','b','oc_a'));
 expect(reviewPath('/tmp','a','oc_a')).not.toBe(reviewPath('/tmp','a','oc_a:thread'));
});
