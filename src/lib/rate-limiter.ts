 export class RateLimiter {
   private requestTimestamps: number[] = [];
   private qp10s: number;
 
   constructor(qps: number = 5) {
     this.qp10s = qps * 10; // 10-second window
   }
 
   async waitAndAcquire(): Promise<void> {
     const now = Date.now();
     const windowStart = now - 10000;
 
     // Clean old timestamps
     this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);
 
     // Wait if at limit
     while (this.requestTimestamps.length >= this.qp10s) {
       const oldest = this.requestTimestamps[0];
       const waitTime = (oldest + 10000) - Date.now() + 100;
       if (waitTime > 0) {
         await new Promise(r => setTimeout(r, waitTime));
       }
       this.requestTimestamps = this.requestTimestamps.filter(t => t > Date.now() - 10000);
     }
 
     this.requestTimestamps.push(Date.now());
   }
 
   getStats() {
     const now = Date.now();
     this.requestTimestamps = this.requestTimestamps.filter(t => t > now - 10000);
     return {
       requestsIn10s: this.requestTimestamps.length,
       availableTokens: Math.max(0, this.qp10s - this.requestTimestamps.length),
       maxPer10s: this.qp10s,
     };
   }
 }
 
 export const kalshiRateLimiter = new RateLimiter(5);