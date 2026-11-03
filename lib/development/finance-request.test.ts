import { afterEach,describe,expect,it,vi } from "vitest";
import { isFinanceDevelopmentRequest } from "@/lib/development/finance-request";
afterEach(()=>vi.unstubAllEnvs());
describe('synthetic preview isolation',()=>{
  it('allows the actual local Host even when Next normalizes its internal URL',()=>{
    vi.stubEnv('NODE_ENV','development');
    expect(isFinanceDevelopmentRequest(new Request('http://localhost:3000/api/finance-development',{headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'}}))).toBe(true);
  });
  it('rejects remote hosts, cross-origin writes and every production request',()=>{
    vi.stubEnv('NODE_ENV','development');
    expect(isFinanceDevelopmentRequest(new Request('http://example.com/api/finance-development'))).toBe(false);
    expect(isFinanceDevelopmentRequest(new Request('http://localhost:3000/api/finance-development',{headers:{origin:'https://example.com'}}))).toBe(false);
    vi.stubEnv('NODE_ENV','production');
    expect(isFinanceDevelopmentRequest(new Request('http://localhost:3000/api/finance-development'))).toBe(false);
  });
});
