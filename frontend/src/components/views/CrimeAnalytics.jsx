import React from 'react';
import { Link } from 'react-router-dom';
import './CrimeAnalytics.css';


function CrimeAnalytics() {
  return (
    <div className="dash">
      {/* SIDEBAR NAVIGATION */}
      

      {/* MAIN CONTENT */}
     
       

        {/* CONTENT AREA */}
        <div className="content-area">
          {/* Page Header */}
          <div className="page-header">
            <h1>Crime Information Reporting & Analysis</h1>
            <p>Comprehensive crime data analytics and reporting system</p>
          </div>

          {/* Crime Types Grid */}
          <div className="crime-types-grid">
            <div className="crime-type-card">
              <div className="crime-type-label">Robbery</div>
              <div className="crime-type-value red">245</div>
              <div className="crime-type-trend">↑ 12% from last month</div>
            </div>

            <div className="crime-type-card">
              <div className="crime-type-label">Theft</div>
              <div className="crime-type-value orange">412</div>
              <div className="crime-type-trend">↑ 8% from last month</div>
            </div>

            <div className="crime-type-card">
              <div className="crime-type-label">Assault</div>
              <div className="crime-type-value yellow">156</div>
              <div className="crime-type-trend">↓ 5% from last month</div>
            </div>

            <div className="crime-type-card">
              <div className="crime-type-label">Vandalism</div>
              <div className="crime-type-value blue">89</div>
              <div className="crime-type-trend">↓ 15% from last month</div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="charts-grid">
            {/* Monthly Crime Trends */}
            <div className="chart-card">
              <div className="chart-header">
                <h3>Monthly Crime Trends</h3>
                <select className="chart-filter">
                  <option>Last 6 Months</option>
                  <option>Last 12 Months</option>
                  <option>This Year</option>
                </select>
              </div>
              <div className="chart-body">
                <div className="chart-placeholder">
                  <div className="chart-placeholder-icon">📊</div>
                  <div className="chart-placeholder-text">Bar Chart</div>
                  <div className="chart-placeholder-desc">Crime incidents by month</div>
                </div>
              </div>
            </div>

            {/* Crime Hotspots */}
            <div className="chart-card">
              <div className="chart-header">
                <h3>Crime Hotspots by Barangay</h3>
                <select className="chart-filter">
                  <option>All Types</option>
                  <option>Robbery</option>
                  <option>Theft</option>
                  <option>Assault</option>
                </select>
              </div>
              <div className="chart-body">
                <div className="chart-placeholder">
                  <div className="chart-placeholder-icon">🗺️</div>
                  <div className="chart-placeholder-text">Heatmap</div>
                  <div className="chart-placeholder-desc">Geographic crime distribution</div>
                </div>
              </div>
            </div>

            {/* Time Distribution */}
            <div className="chart-card">
              <div className="chart-header">
                <h3>Crime Time Distribution</h3>
                <select className="chart-filter">
                  <option>24 Hours</option>
                  <option>Day/Night</option>
                  <option>By Day of Week</option>
                </select>
              </div>
              <div className="chart-body">
                <div className="chart-placeholder">
                  <div className="chart-placeholder-icon">🕐</div>
                  <div className="chart-placeholder-text">Line Chart</div>
                  <div className="chart-placeholder-desc">Incidents by time of day</div>
                </div>
              </div>
            </div>

            {/* Crime Type Distribution */}
            <div className="chart-card">
              <div className="chart-header">
                <h3>Crime Type Distribution</h3>
                <select className="chart-filter">
                  <option>This Month</option>
                  <option>This Quarter</option>
                  <option>This Year</option>
                </select>
              </div>
              <div className="chart-body">
                <div className="chart-placeholder">
                  <div className="chart-placeholder-icon">🎯</div>
                  <div className="chart-placeholder-text">Donut Chart</div>
                  <div className="chart-placeholder-desc">Percentage by crime type</div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Locations Table */}
          <div className="data-table-card">
            <div className="table-header">
              <h3>Top Crime Locations (This Month)</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Barangay</th>
                  <th>Total Incidents</th>
                  <th>Most Common Type</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>#1</strong></td>
                  <td>Brgy. Molino III</td>
                  <td>48</td>
                  <td>Theft</td>
                  <td><span className="trend-indicator trend-up">↑ 15%</span></td>
                </tr>
                <tr>
                  <td><strong>#2</strong></td>
                  <td>Brgy. Talaba V</td>
                  <td>42</td>
                  <td>Robbery</td>
                  <td><span className="trend-indicator trend-up">↑ 8%</span></td>
                </tr>
                <tr>
                  <td><strong>#3</strong></td>
                  <td>Brgy. Queens Row Central</td>
                  <td>35</td>
                  <td>Assault</td>
                  <td><span className="trend-indicator trend-down">↓ 3%</span></td>
                </tr>
                <tr>
                  <td><strong>#4</strong></td>
                  <td>Brgy. Niog II</td>
                  <td>29</td>
                  <td>Vandalism</td>
                  <td><span className="trend-indicator trend-down">↓ 12%</span></td>
                </tr>
                <tr>
                  <td><strong>#5</strong></td>
                  <td>Brgy. Panapaan VIII</td>
                  <td>24</td>
                  <td>Theft</td>
                  <td><span className="trend-indicator trend-up">↑ 5%</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      
    </div>
  );
}

export default CrimeAnalytics;