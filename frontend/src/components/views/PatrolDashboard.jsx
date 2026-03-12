import { Link } from "react-router-dom";
import "./PatrolDashboard.css";

const PatrollerDashboard = () => {
  return (
    <div className="dash">
      {/* SIDEBAR */}
      

      {/* MAIN CONTENT */}
        {/* CONTENT */}
        <div className="content-area">
          <div className="page-header">
            <h1>Patroller Dashboard</h1>
            <p>Real-time Patroller status and monitoring</p>
          </div>

          {/* STATS */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-icon icon-green">🛡️</div>
              <div className="stat-value">24</div>
              <div className="stat-label">Active Patrols</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon icon-gray">⏸️</div>
              <div className="stat-value">8</div>
              <div className="stat-label">Off Duty</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon icon-yellow">☕</div>
              <div className="stat-value">5</div>
              <div className="stat-label">On Break</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon icon-blue">👮</div>
              <div className="stat-value">37</div>
              <div className="stat-label">Total Officers</div>
            </div>
          </div>

          {/* TABLE */}
          <div className="table-card">
            <div className="table-header">
              <h3>Active Patrollers</h3>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Officer</th>
                    <th>Badge Number</th>
                    <th>Current Location</th>
                    <th>Status</th>
                    <th>Last Update</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div className="officer-info">
                        <div className="officer-avatar">MS</div>
                        <div className="officer-details">
                          <div className="officer-name">
                            Off. Maria Santos
                          </div>
                          <div className="officer-badge">
                            Badge P-001
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>P-001</td>
                    <td>Brgy. Molino III, Bacoor</td>
                    <td>
                      <span className="status-badge status-patrol">
                        On Patrol
                      </span>
                    </td>
                    <td>
                      <span className="time-badge">2 mins ago</span>
                    </td>
                  </tr>

                  {/* remaining rows unchanged – same pattern */}
                </tbody>
              </table>
            </div>
          </div>
        </div>
     
    </div>
  );
}

export default PatrollerDashboard;