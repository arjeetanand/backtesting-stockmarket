"use client";

import TopBar from "@/components/layout/TopBar";
import { AlertTriangle, ShieldCheck, CheckCircle2, ShieldAlert } from "lucide-react";

export default function BiasValidityPage() {
  return (
    <div className='backtrack-page'>
      <TopBar />
      <div className='backtrack-content bt-stack'>
        <section className='bt-heading-row'>
          <div>
            <div className="bt-kicker"><span className="live-dot" /> 08 / RISK ENGINE</div>
            <h1>Quant validity &amp; bias audit.</h1>
            <p>Automated checks for lookahead bias, parameter overfitting, survivor bias, and realistic transaction costs.</p>
          </div>
          <div className="bt-heading-actions">
            <span className="data-source"><ShieldCheck size={14} /> Auditor Active</span>
          </div>
        </section>

        {/* Top row */}
        <div className='bt-grid-12'>
          {/* Validity Index Score Card */}
          <div className='bt-col-4 bt-panel bt-score-card'>
            <div>
              <span className='bt-eyebrow'>VALIDITY INDEX SCORE</span>
              <div style={{display:'flex',alignItems:'baseline',gap:'6px',marginTop:'12px',marginBottom:'8px'}}>
                <span className='bt-score-number critical'>42</span>
                <span className='bt-score-denom'>/ 100</span>
              </div>
              <p style={{fontSize:'13px',color:'#e11d48',fontWeight:700,marginTop:'4px'}}>Critical degradation detected in Out-Of-Sample regime.</p>
            </div>
            <div className='bt-score-rows'>
              <div className='bt-score-row'>
                <span className='bt-score-row-label'>Analyzed Parameters:</span>
                <span className='bt-score-row-val'>1,402</span>
              </div>
              <div className='bt-score-row'>
                <span className='bt-score-row-label'>Degrees of Freedom:</span>
                <span className='bt-score-row-val' style={{color:'#e11d48'}}>Low</span>
              </div>
            </div>
          </div>

          {/* HIGH SEVERITY alert card */}
          <div className='bt-col-8 bt-alert-card high'>
            <div className='bt-alert-card-head'>
              <div className='bt-alert-card-title-row'>
                <div className='bt-alert-icon high'><ShieldAlert size={22}/></div>
                <div>
                  <p className='bt-alert-card-title'>Potential Parameter Overfitting</p>
                  <p className='bt-alert-card-subtitle'>High variance between in-sample and out-of-sample tests</p>
                </div>
              </div>
              <span className='bt-severity-pill high'>HIGH SEVERITY</span>
            </div>

            <div className='bt-grid-2'>
              {/* Evidence */}
              <div>
                <div className='bt-why-matters'><h4>Evidence Data</h4></div>
                <div className='bt-evidence-table'>
                  <div className='bt-evidence-row'>
                    <span className='bt-evidence-label'>In-Sample Sharpe:</span>
                    <span className='bt-evidence-val indigo'>3.24</span>
                  </div>
                  <div className='bt-evidence-row'>
                    <span className='bt-evidence-label'>Out-of-Sample Sharpe:</span>
                    <span className='bt-evidence-val rose'>0.82</span>
                  </div>
                  <div className='bt-evidence-row'>
                    <span className='bt-evidence-label'>Sharpe Degradation:</span>
                    <span className='bt-evidence-val rose'>-74.6%</span>
                  </div>
                  <div className='bt-evidence-row divider'>
                    <span className='bt-evidence-label'>Tuned Parameters:</span>
                    <span className='bt-evidence-val'>14 within 2% tolerance</span>
                  </div>
                </div>
              </div>

              {/* Why it matters + Recommendation */}
              <div className='bt-stack-sm'>
                <div className='bt-why-matters'>
                  <h4>Why it Matters</h4>
                  <p>The strategy exhibits performance collapse when exposed to unseen validation data. The high density of tuned parameters suggests the model has memorized historical noise rather than capturing structural market inefficiencies.</p>
                </div>
                <div className='bt-recommendation indigo'>
                  <h4><CheckCircle2 size={11}/>Recommended Validation</h4>
                  <p>Implement Combinatorial Purged Cross-Validation (CPCV) and evaluate the Deflated Sharpe Ratio to adjust for multiple testing bias.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Medium + Low cards */}
        <div className='bt-grid-2'>
          {/* Small Trade Sample - MEDIUM */}
          <div className='bt-alert-card medium'>
            <div className='bt-alert-card-head'>
              <div className='bt-alert-card-title-row'>
                <div className='bt-alert-icon medium'><AlertTriangle size={20}/></div>
                <div>
                  <p className='bt-alert-card-title'>Small Trade Sample</p>
                </div>
              </div>
              <span className='bt-severity-pill medium'>MEDIUM</span>
            </div>
            <div className='bt-stack-sm'>
              <div className='bt-why-matters'>
                <h4>Evidence</h4>
                <span className='bt-inline-code'>N = 142 trades (5 yr horizon)</span>
              </div>
              <div className='bt-why-matters'>
                <h4>Why it Matters</h4>
                <p>A sample size under 300 across a 5-year macro cycle lacks statistical power to rule out luck. The t-statistic of the mean return is artificially inflated.</p>
              </div>
              <div className='bt-recommendation amber'>
                <h4>Recommended Validation</h4>
                <p>Extend historical backtest window to 10+ years or lower signal threshold to increase execution frequency, then recalculate standard error.</p>
              </div>
            </div>
          </div>

          {/* Optimistic Transaction Costs - LOW */}
          <div className='bt-alert-card low'>
            <div className='bt-alert-card-head'>
              <div className='bt-alert-card-title-row'>
                <div className='bt-alert-icon low'><ShieldCheck size={20}/></div>
                <div>
                  <p className='bt-alert-card-title'>Optimistic Transaction Costs</p>
                </div>
              </div>
              <span className='bt-severity-pill low'>LOW</span>
            </div>
            <div className='bt-stack-sm'>
              <div className='bt-why-matters'>
                <h4>Evidence</h4>
                <div className='bt-evidence-table'>
                  <div className='bt-evidence-row'><span className='bt-evidence-label'>Model Assumption:</span><span className='bt-evidence-val sky'>0.5 bps</span></div>
                  <div className='bt-evidence-row'><span className='bt-evidence-label'>Asset Class Average:</span><span className='bt-evidence-val'>1.2 bps (VWAP)</span></div>
                </div>
              </div>
              <div className='bt-why-matters'>
                <h4>Why it Matters</h4>
                <p>Flat fee models underestimate impact in low-liquidity regimes. While not immediately critical, it linearly inflates projected CAGR.</p>
              </div>
              <div className='bt-recommendation sky'>
                <h4>Recommended Validation</h4>
                <p>Apply a tiered execution model utilizing volume-weighted impact curves specific to the target instrument&apos;s average daily volume (ADV).</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
