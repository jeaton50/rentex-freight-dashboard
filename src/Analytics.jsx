// Analytics.jsx - Add this as a new file in your src directory

import React, { useState, useMemo } from 'react';

function Analytics({ 
  shipments, 
  selectedYear, 
  selectedMonth, 
  companies, 
  agents, 
  clients, 
  cities, 
  states,
  onBack 
}) {
  const [selectedTab, setSelectedTab] = useState('overview');
const [selectedDimension, setSelectedDimension] = useState('company');
const [selectedEntities, setSelectedEntities] = useState([]);

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'rankings', label: '🏆 Rankings' },
    { id: 'trends', label: '📈 Trends' },
    { id: 'comparison', label: '⚖️ Compare' },
    { id: 'breakdown', label: '🔍 Breakdown' },
    { id: 'individual', label: '👤 Individual' },
  ];

  // Calculate comprehensive statistics
  const stats = useMemo(() => {
    const calculateStats = (groupField) => {
      const summary = {};
      
      shipments.forEach((s) => {
        const key = s[groupField] || '(Unassigned)';
        if (!summary[key]) {
          summary[key] = {
            name: key,
            count: 0,
            revenue: 0,
            shipments: [],
          };
        }
        summary[key].count += 1;
        summary[key].revenue += Number(s.shippingCharge || 0);
        summary[key].shipments.push(s);
      });

      return Object.values(summary).map(item => ({
        ...item,
        avgPerShipment: item.count > 0 ? item.revenue / item.count : 0,
      }));
    };

    return {
      company: calculateStats('company'),
      agent: calculateStats('agent'),
      client: calculateStats('client'),
      city: calculateStats('city'),
      state: calculateStats('state'),
      location: calculateStats('location'),
      shipMethod: calculateStats('shipMethod'),
      vehicleType: calculateStats('vehicleType'),
    };
  }, [shipments]);

  // Get current dimension data
  const currentData = stats[selectedDimension] || [];

  // Sort and rank data
  const rankedByRevenue = [...currentData].sort((a, b) => b.revenue - a.revenue);
  const rankedByVolume = [...currentData].sort((a, b) => b.count - a.count);
  const rankedByAvg = [...currentData].sort((a, b) => b.avgPerShipment - a.avgPerShipment);

  // Total metrics
  const totalRevenue = shipments.reduce((sum, s) => sum + Number(s.shippingCharge || 0), 0);
  const totalShipments = shipments.length;
  const avgPerShipment = totalShipments > 0 ? totalRevenue / totalShipments : 0;

  // Render functions for each tab
  const renderOverview = () => (
    <div style={{ padding: '24px' }}>
      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <MetricCard title="Total Revenue" value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
        <MetricCard title="Total Shipments" value={totalShipments} />
        <MetricCard title="Avg per Shipment" value={`$${avgPerShipment.toFixed(2)}`} />
        <MetricCard title="Active Entities" value={currentData.length} />
      </div>

      {/* Dimension Selector */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Analyze by Dimension
        </h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {['company', 'agent', 'client', 'city', 'state', 'location', 'shipMethod', 'vehicleType'].map((dim) => (
            <button
              key={dim}
              onClick={() => setSelectedDimension(dim)}
              style={{
                padding: '10px 20px',
                background: selectedDimension === dim ? '#3b82f6' : 'white',
                color: selectedDimension === dim ? 'white' : '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {dim.replace(/([A-Z])/g, ' $1').trim()}
            </button>
          ))}
        </div>
      </div>

      {/* Top 10 */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Top 10 by {selectedDimension.charAt(0).toUpperCase() + selectedDimension.slice(1)}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rankedByRevenue.slice(0, 10).map((item, idx) => (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                background: idx === 0 ? '#fbbf24' : idx === 1 ? '#cbd5e1' : idx === 2 ? '#f97316' : '#e2e8f0',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '14px',
              }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>{item.name}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{item.count} shipments</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#1e293b' }}>
                  ${item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  ${item.avgPerShipment.toFixed(2)} avg
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderRankings = () => (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        {/* Revenue Rankings */}
        <RankingCard
          title="💰 Top by Revenue"
          data={rankedByRevenue}
          valueKey="revenue"
          formatter={(val) => `$${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        />

        {/* Volume Rankings */}
        <RankingCard
          title="📦 Top by Volume"
          data={rankedByVolume}
          valueKey="count"
          formatter={(val) => val.toString()}
        />

        {/* Average Value Rankings */}
        <RankingCard
          title="📊 Top by Avg Value"
          data={rankedByAvg}
          valueKey="avgPerShipment"
          formatter={(val) => `$${val.toFixed(2)}`}
        />
      </div>
    </div>
  );

  const renderComparison = () => {
    const availableEntities = currentData.map(d => d.name);

    return (
      <div style={{ padding: '24px' }}>
        {/* Entity Selection */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
            Select Entities to Compare (Up to 5)
          </h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {availableEntities.map((entity) => (
              <button
                key={entity}
                onClick={() => {
                  if (selectedEntities.includes(entity)) {
                    setSelectedEntities(selectedEntities.filter(e => e !== entity));
                  } else if (selectedEntities.length < 5) {
                    setSelectedEntities([...selectedEntities, entity]);
                  }
                }}
                style={{
                  padding: '10px 20px',
                  background: selectedEntities.includes(entity) ? '#3b82f6' : 'white',
                  color: selectedEntities.includes(entity) ? 'white' : '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {entity}
              </button>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: '#64748b' }}>
            {selectedEntities.length}/5 selected
          </p>
        </div>

        {/* Comparison Table */}
        {selectedEntities.length > 0 && (
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', overflowX: 'auto' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
              Side-by-Side Comparison
            </h3>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#64748b' }}>Metric</th>
                  {selectedEntities.map((entity) => (
                    <th key={entity} style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#1e293b' }}>
                      {entity}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontWeight: '600' }}>Total Revenue</td>
                  {selectedEntities.map((entity) => {
                    const data = currentData.find(d => d.name === entity);
                    return (
                      <td key={entity} style={{ padding: '12px', textAlign: 'right' }}>
                        ${data?.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
                      </td>
                    );
                  })}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontWeight: '600' }}>Shipments</td>
                  {selectedEntities.map((entity) => {
                    const data = currentData.find(d => d.name === entity);
                    return <td key={entity} style={{ padding: '12px', textAlign: 'right' }}>{data?.count || 0}</td>;
                  })}
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px', fontWeight: '600' }}>Avg per Shipment</td>
                  {selectedEntities.map((entity) => {
                    const data = currentData.find(d => d.name === entity);
                    return (
                      <td key={entity} style={{ padding: '12px', textAlign: 'right' }}>
                        ${data?.avgPerShipment.toFixed(2) || '0.00'}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td style={{ padding: '12px', fontWeight: '600' }}>Market Share</td>
                  {selectedEntities.map((entity) => {
                    const data = currentData.find(d => d.name === entity);
                    const share = totalRevenue > 0 ? (data?.revenue || 0) / totalRevenue * 100 : 0;
                    return <td key={entity} style={{ padding: '12px', textAlign: 'right' }}>{share.toFixed(1)}%</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderBreakdown = () => {
    // Cross-dimensional analysis: Company × State
    const companiesData = stats.company || [];
    const statesData = stats.state || [];
    const stateNames = statesData.map(s => s.name).slice(0, 5);

    const matrix = companiesData.slice(0, 10).map(company => {
      const row = { name: company.name };
      stateNames.forEach(state => {
        const total = company.shipments
          .filter(s => s.state === state)
          .reduce((sum, s) => sum + Number(s.shippingCharge || 0), 0);
        row[state] = total;
      });
      row.total = company.revenue;
      return row;
    });

    return (
      <div style={{ padding: '24px' }}>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', overflowX: 'auto' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
            Revenue Breakdown: Company × State
          </h3>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '10px', fontWeight: '600', color: '#64748b' }}>Company</th>
                {stateNames.map(state => (
                  <th key={state} style={{ textAlign: 'right', padding: '10px', fontWeight: '600', color: '#64748b' }}>
                    {state}
                  </th>
                ))}
                <th style={{ textAlign: 'right', padding: '10px', fontWeight: '600', color: '#64748b' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, idx) => (
                <tr key={row.name} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                  <td style={{ padding: '10px', fontWeight: '600' }}>{row.name}</td>
                  {stateNames.map(state => (
                    <td key={state} style={{ padding: '10px', textAlign: 'right' }}>
                      ${(row[state] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  ))}
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>
                    ${row.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderIndividual = () => {
    const selectedEntity = selectedEntities[0] || currentData[0]?.name;
    const entityData = currentData.find(d => d.name === selectedEntity);

    if (!entityData) {
      return (
        <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
          No data available. Please select a dimension with data.
        </div>
      );
    }

    // Calculate additional metrics
    const monthlyBreakdown = {};
    entityData.shipments.forEach(s => {
      const date = s.shipDate ? new Date(s.shipDate) : null;
      const month = date ? date.toLocaleString('default', { month: 'short' }) : 'Unknown';
      if (!monthlyBreakdown[month]) monthlyBreakdown[month] = { count: 0, revenue: 0 };
      monthlyBreakdown[month].count++;
      monthlyBreakdown[month].revenue += Number(s.shippingCharge || 0);
    });

    return (
      <div style={{ padding: '24px' }}>
        {/* Entity Selector */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <label style={{ fontSize: '14px', fontWeight: '600', color: '#475569', marginBottom: '8px', display: 'block' }}>
            Select Entity
          </label>
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntities([e.target.value])}
            style={{ width: '100%', maxWidth: '400px', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
          >
            {currentData.map(d => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <MetricCard title="Total Revenue" value={`$${entityData.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
          <MetricCard title="Total Shipments" value={entityData.count} />
          <MetricCard title="Avg per Shipment" value={`$${entityData.avgPerShipment.toFixed(2)}`} />
          <MetricCard
            title="Market Share"
            value={`${totalRevenue > 0 ? ((entityData.revenue / totalRevenue) * 100).toFixed(1) : '0.0'}%`}
          />
        </div>

        {/* Detailed Shipments Table */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', overflowX: 'auto' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
            All Shipments for {selectedEntity}
          </h3>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '10px', fontWeight: '600', color: '#64748b' }}>Ref #</th>
                <th style={{ textAlign: 'left', padding: '10px', fontWeight: '600', color: '#64748b' }}>Client</th>
                <th style={{ textAlign: 'left', padding: '10px', fontWeight: '600', color: '#64748b' }}>Ship Date</th>
                <th style={{ textAlign: 'left', padding: '10px', fontWeight: '600', color: '#64748b' }}>City</th>
                <th style={{ textAlign: 'left', padding: '10px', fontWeight: '600', color: '#64748b' }}>State</th>
                <th style={{ textAlign: 'right', padding: '10px', fontWeight: '600', color: '#64748b' }}>Charge</th>
              </tr>
            </thead>
            <tbody>
              {entityData.shipments.map((shipment, idx) => (
                <tr key={shipment.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                  <td style={{ padding: '10px' }}>{shipment.refNum}</td>
                  <td style={{ padding: '10px' }}>{shipment.client}</td>
                  <td style={{ padding: '10px' }}>{shipment.shipDate}</td>
                  <td style={{ padding: '10px' }}>{shipment.city}</td>
                  <td style={{ padding: '10px' }}>{shipment.state}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    ${Number(shipment.shippingCharge || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>
              📊 Analytics Dashboard
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              {selectedMonth} {selectedYear} • {totalShipments} shipments • ${totalRevenue.toLocaleString()} revenue
            </p>
          </div>
          <button
            onClick={onBack}
            style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '8px', overflowX: 'auto' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              style={{
                padding: '16px 24px',
                background: 'transparent',
                color: selectedTab === tab.id ? '#3b82f6' : '#64748b',
                border: 'none',
                borderBottom: selectedTab === tab.id ? '3px solid #3b82f6' : '3px solid transparent',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {selectedTab === 'overview' && renderOverview()}
        {selectedTab === 'rankings' && renderRankings()}
        {selectedTab === 'comparison' && renderComparison()}
        {selectedTab === 'breakdown' && renderBreakdown()}
        {selectedTab === 'individual' && renderIndividual()}
      </div>
    </div>
  );
}

// Helper Components
function MetricCard({ title, value }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b' }}>{value}</div>
    </div>
  );
}

function RankingCard({ title, data, valueKey, formatter }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>{title}</h3>
      <table style={{ width: '100%', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#64748b' }}>Rank</th>
            <th style={{ textAlign: 'left', padding: '8px', fontWeight: '600', color: '#64748b' }}>Entity</th>
            <th style={{ textAlign: 'right', padding: '8px', fontWeight: '600', color: '#64748b' }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((item, idx) => (
            <tr key={item.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px' }}>{idx + 1}</td>
              <td style={{ padding: '8px', fontWeight: '600' }}>{item.name}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{formatter(item[valueKey])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Analytics;
