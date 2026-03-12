import React from "react";
import { Link } from "react-router-dom";
import "./PatrolScheduling.css";

const PatrolScheduling = () => {
  return (
    <div className="dash">
      {/* SIDEBAR */}
      

      {/* MAIN CONTENT */}
        <div className="psch-content-area">
          <div className="psch-page-header">
            <div className="psch-page-header-left">
              <h1>Patrol Scheduling</h1>
              <p>Manage patrol officer schedules and assignments</p>
            </div>
            <button className="psch-btn psch-btn-primary">+ Add Schedule</button>
          </div>

          {/* Calendar Controls */}
          <div className="psch-calendar-controls">
            <div className="psch-calendar-nav">
              <button className="psch-nav-btn">‹ Previous</button>
              <div className="psch-current-period">January 20-26, 2024</div>
              <button className="psch-nav-btn">Next ›</button>
            </div>
            <div className="psch-view-toggle">
              <button className="psch-toggle-btn psch-active">Week</button>
              <button className="psch-toggle-btn">Month</button>
            </div>
          </div>

          {/* Schedule Table */}
          <div className="psch-schedule-card">
            <table className="psch-schedule-table">
              <thead>
                <tr>
                  <th style={{ width: "120px" }}>Date / Day</th>
                  <th>Morning Shift (6AM-2PM)</th>
                  <th>Afternoon Shift (2PM-10PM)</th>
                  <th>Night Shift (10PM-6AM)</th>
                  <th style={{ width: "120px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Example Row */}
                <tr>
                  <td>
                    <div><strong>Jan 20</strong></div>
                    <div style={{ fontSize: "12px", color: "var(--gray-600)" }}>Monday</div>
                  </td>
                  <td>
                    <div className="psch-assignment-cell">
                      <div>
                        <span className="psch-officer-name">Off. Maria Santos</span>
                        <div className="psch-area-assignment">Brgy. Molino III</div>
                      </div>
                      <div>
                        <span className="psch-officer-name">Off. Juan Cruz</span>
                        <div className="psch-area-assignment">Brgy. Talaba V</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="psch-assignment-cell">
                      <div>
                        <span className="psch-officer-name">Off. Pedro Garcia</span>
                        <div className="psch-area-assignment">Brgy. Queens Row</div>
                      </div>
                      <div>
                        <span className="psch-officer-name">Off. Rosa Martinez</span>
                        <div className="psch-area-assignment">Brgy. Niog II</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="psch-assignment-cell">
                      <div>
                        <span className="psch-officer-name">Off. Carlos Ramos</span>
                        <div className="psch-area-assignment">Brgy. Panapaan VIII</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="psch-table-actions">
                      <a href="#" className="psch-action-link">Edit</a>
                    </div>
                  </td>
                </tr>
               
               <tr>
                  <td>
                    <div><strong>Jan 21</strong></div>
                    <div style={{ fontSize: "12px", color: "var(--gray-600)" }}>Monday</div>
                  </td>
                  <td>
                    <div className="psch-assignment-cell">
                      <div>
                        <span className="psch-officer-name">Off. Ana Reyes</span>
                        <div className="psch-area-assignment">Brgy. Molino VI</div>
                      </div>
                      <div>
                        <span className="psch-officer-name">Off. Lisa Hernandez</span>
                        <div className="psch-area-assignment">Brgy. Habay II</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="psch-assignment-cell">
                      <div>
                        <span className="psch-officer-name">Off. Miguel Torres</span>
                        <div className="psch-area-assignment">Brgy. San Nicolas III</div>
                      </div>
                      <div>
                        <span className="psch-officer-name">Off. Maria Santos</span>
                        <div className="psch-area-assignment">Brgy. Molino III</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="psch-assignment-cell">
                      <div>
                        <span className="psch-officer-name">Off. Juan Cruz</span>
                        <div className="psch-area-assignment">Brgy. Talaba V</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="psch-table-actions">
                      <a href="#" className="psch-action-link">Edit</a>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td>
                    <div><strong>Jan 22</strong></div>
                    <div style={{ fontSize: "12px", color: "var(--gray-600)" }}>Monday</div>
                  </td>
                  <td>
                    <div className="psch-assignment-cell">
                      <div>
                        <span className="psch-officer-name">Off. Pedro Garcia</span>
                        <div className="psch-area-assignment">Brgy. Queens Row</div>
                      </div>
                      <div>
                        <span className="psch-officer-name">Off. Carlos Ramos</span>
                        <div className="psch-area-assignment">Brgy. Panapaan VIII</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="psch-assignment-cell">
                      <div>
                          <span className="psch-officer-name">Off. Rosa Martinez</span>
                        <div className="psch-area-assignment">Brgy. Niog II</div>
                      </div>
                      <div>
                        <span className="psch-officer-name">Off. Ana Reyes</span>
                        <div className="psch-area-assignment">Brgy. Molino VI</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="psch-assignment-cell">
                      <div>
                        <span className="psch-officer-name">Off. Lisa Hernandez</span>
                        <div className="psch-area-assignment">Brgy. Habay II</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="psch-table-actions">
                      <a href="#" className="psch-action-link">Edit</a>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
    
    </div>
  );
};

export default PatrolScheduling;
