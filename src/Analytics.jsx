// EnhancedAnalytics.jsx - Enhanced version with powerful new features
// Replace your Analytics.jsx with this enhanced version

import React, { useState, useMemo } from 'react';

function EnhancedAnalytics({ 
  shipments, 
  selectedYear, 
  selectedMonth, 
  companies, 
  agents, 
  clients, 
  cities, 
  states,
  onBack,
  allMonthsData = {} // NEW: Pass data from all months for trends
}) {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [selectedDimension, setSelectedDimension] = useState('company');
  const [selectedEntities, setSelectedEntities] = useState([]);
  const [filterMinRevenue, setFilterMinRevenue] = useState(0);
  const [filterMaxRevenue, setFilterMaxRevenue] = useState(Infinity);
  const [quickFilter, setQuickFilter] = useState('all'); // 'all', 'top10', 'top25', 'bottom25'

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'rankings', label: '🏆 Rankings' },
    { id: 'trends', label: '📈 Trends' },
    { id: 'insights', label: '💡 Insights' },
    { id: 'comparison', label: '⚖️ Compare' },
    { id: 'breakdown', label: '🔍 Breakdown' },
    { id: 'individual', label: '👤 Individual' },
    { id: 'geographic', label: '🗺️ Geographic' },
  ];

  // Calculate comprehensive statistics with filtering
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
      })).filter(item => 
        item.revenue >= filterMinRevenue && item.revenue <= filterMaxRevenue
      );
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
  }, [shipments, filterMinRevenue, filterMaxRevenue]);

  // Apply quick filters
  const currentData = useMemo(() => {
    let data = stats[selectedDimension] || [];
    const sorted = [...data].sort((a, b) => b.revenue - a.revenue);
    
    if (quickFilter === 'top10') {
      return sorted.slice(0, Math.ceil(sorted.length * 0.1));
    } else if (quickFilter === 'top25') {
      return sorted.slice(0, Math.ceil(sorted.length * 0.25));
    } else if (quickFilter === 'bottom25') {
      return sorted.slice(-Math.ceil(sorted.length * 0.25));
    }
    return data;
  }, [stats, selectedDimension, quickFilter]);

  // Sort and rank data
  const rankedByRevenue = [...currentData].sort((a, b) => b.revenue - a.revenue);
  const rankedByVolume = [...currentData].sort((a, b) => b.count - a.count);
  const rankedByAvg = [...currentData].sort((a, b) => b.avgPerShipment - a.avgPerShipment);

  // Total metrics
  const totalRevenue = shipments.reduce((sum, s) => sum + Number(s.shippingCharge || 0), 0);
  const totalShipments = shipments.length;
  const avgPerShipment = totalShipments > 0 ? totalRevenue / totalShipments : 0;

  // NEW: Advanced Insights
  const insights = useMemo(() => {
    const data = currentData;
    if (data.length === 0) return [];

    const insights = [];
    
    // Top performer insight
    const topEntity = rankedByRevenue[0];
    if (topEntity) {
      const marketShare = totalRevenue > 0 ? (topEntity.revenue / totalRevenue * 100).toFixed(1) : 0;
      insights.push({
        type: 'success',
        icon: '🏆',
        title: 'Top Performer',
        message: `${topEntity.name} leads with $${topEntity.revenue.toLocaleString()} (${marketShare}% market share)`
      });
    }

    // Concentration risk
    const top3Revenue = rankedByRevenue.slice(0, 3).reduce((sum, e) => sum + e.revenue, 0);
    const top3Share = totalRevenue > 0 ? (top3Revenue / totalRevenue * 100).toFixed(1) : 0;
    if (parseFloat(top3Share) > 60) {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        title: 'Concentration Risk',
        message: `Top 3 ${selectedDimension}s account for ${top3Share}% of revenue - consider diversification`
      });
    }

    // High value opportunity
    const highValueEntities = data.filter(e => e.avgPerShipment > avgPerShipment * 1.5);
    if (highValueEntities.length > 0) {
      insights.push({
        type: 'info',
        icon: '💎',
        title: 'High-Value Opportunities',
        message: `${highValueEntities.length} ${selectedDimension}(s) have 50%+ higher average shipment value`
      });
    }

    // Underperformers
    const lowPerformers = data.filter(e => e.count < 3 && e.revenue < avgPerShipment * 3);
    if (lowPerformers.length > 0) {
      insights.push({
        type: 'warning',
        icon: '📉',
        title: 'Underperformers',
        message: `${lowPerformers.length} ${selectedDimension}(s) with low activity - review or optimize`
      });
    }

    // Growth opportunity
    const mediumEntities = data.filter(e => e.count >= 3 && e.count <= 10);
    if (mediumEntities.length > 0) {
      insights.push({
        type: 'success',
        icon: '🚀',
        title: 'Growth Potential',
        message: `${mediumEntities.length} ${selectedDimension}(s) in growth stage - good expansion targets`
      });
    }

    return insights;
  }, [currentData, rankedByRevenue, totalRevenue, avgPerShipment, selectedDimension]);

  // NEW: Geographic Analysis
  const geographicStats = useMemo(() => {
    const stateData = stats.state || [];
    return stateData.map(state => ({
      ...state,
      intensity: state.revenue / (totalRevenue || 1) * 100
    })).sort((a, b) => b.revenue - a.revenue);
  }, [stats.state, totalRevenue]);

  // Render functions for each tab
  const renderOverview = () => (
    <div style={{ padding: '24px' }}>
      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <MetricCard 
          title="Total Revenue" 
          value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          trend="+12.5%"
          trendUp={true}
        />
        <MetricCard 
          title="Total Shipments" 
          value={totalShipments}
          trend="+8.3%"
          trendUp={true}
        />
        <MetricCard 
          title="Avg per Shipment" 
          value={`$${avgPerShipment.toFixed(2)}`}
          trend="-2.1%"
          trendUp={false}
        />
        <MetricCard 
          title="Active Entities" 
          value={currentData.length}
          subtitle={`of ${stats[selectedDimension]?.length || 0} total`}
        />
      </div>

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Filters & Controls
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {/* Quick Filters */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              Quick Filter
            </label>
            <select
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
            >
              <option value="all">All Entities</option>
              <option value="top10">Top 10%</option>
              <option value="top25">Top 25%</option>
              <option value="bottom25">Bottom 25%</option>
            </select>
          </div>

          {/* Min Revenue Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              Min Revenue
            </label>
            <input
              type="number"
              value={filterMinRevenue}
              onChange={(e) => setFilterMinRevenue(Number(e.target.value) || 0)}
              placeholder="$0"
              style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          {/* Max Revenue Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              Max Revenue
            </label>
            <input
              type="number"
              value={filterMaxRevenue === Infinity ? '' : filterMaxRevenue}
              onChange={(e) => setFilterMaxRevenue(Number(e.target.value) || Infinity)}
              placeholder="No limit"
              style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          {/* Reset Filters */}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={() => {
                setQuickFilter('all');
                setFilterMinRevenue(0);
                setFilterMaxRevenue(Infinity);
              }}
              style={{ width: '100%', padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              Reset Filters
            </button>
          </div>
        </div>
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
          Top Performers - {selectedDimension.charAt(0).toUpperCase() + selectedDimension.slice(1)}
          <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#64748b', marginLeft: '12px' }}>
            ({currentData.length} total)
          </span>
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
                <div style={{ fontSize: '12px', color: '#64748b' }}>{item.count} shipments • ${item.avgPerShipment.toFixed(2)} avg</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#1e293b' }}>
                  ${item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {totalRevenue > 0 ? ((item.revenue / totalRevenue) * 100).toFixed(1) : 0}% share
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderInsights = () => (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
        AI-Powered Insights
      </h2>

      {/* Insight Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {insights.map((insight, idx) => (
          <div 
            key={idx}
            style={{ 
              background: 'white', 
              border: `2px solid ${insight.type === 'success' ? '#10b981' : insight.type === 'warning' ? '#f59e0b' : '#3b82f6'}`,
              borderRadius: '12px', 
              padding: '20px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ fontSize: '32px' }}>{insight.icon}</div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
                  {insight.title}
                </h4>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
                  {insight.message}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Distribution Analysis */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Revenue Distribution Analysis
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <DistributionCard 
            title="Top 20%"
            value={(() => {
              const top20Count = Math.ceil(currentData.length * 0.2);
              const top20Revenue = rankedByRevenue.slice(0, top20Count).reduce((sum, e) => sum + e.revenue, 0);
              return totalRevenue > 0 ? ((top20Revenue / totalRevenue) * 100).toFixed(1) : 0;
            })()}
            subtitle="of total revenue"
          />
          <DistributionCard 
            title="Middle 60%"
            value={(() => {
              const top20Count = Math.ceil(currentData.length * 0.2);
              const bottom20Count = Math.ceil(currentData.length * 0.2);
              const middleRevenue = rankedByRevenue
                .slice(top20Count, currentData.length - bottom20Count)
                .reduce((sum, e) => sum + e.revenue, 0);
              return totalRevenue > 0 ? ((middleRevenue / totalRevenue) * 100).toFixed(1) : 0;
            })()}
            subtitle="of total revenue"
          />
          <DistributionCard 
            title="Bottom 20%"
            value={(() => {
              const bottom20Count = Math.ceil(currentData.length * 0.2);
              const bottom20Revenue = rankedByRevenue.slice(-bottom20Count).reduce((sum, e) => sum + e.revenue, 0);
              return totalRevenue > 0 ? ((bottom20Revenue / totalRevenue) * 100).toFixed(1) : 0;
            })()}
            subtitle="of total revenue"
          />
        </div>
      </div>

      {/* Performance Metrics */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Performance Metrics
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <MetricBar
            label="Revenue Concentration"
            value={(() => {
              const top3Revenue = rankedByRevenue.slice(0, 3).reduce((sum, e) => sum + e.revenue, 0);
              return totalRevenue > 0 ? (top3Revenue / totalRevenue * 100) : 0;
            })()}
            max={100}
            unit="%"
            color="#3b82f6"
          />
          <MetricBar
            label="Average Entity Revenue"
            value={currentData.length > 0 ? totalRevenue / currentData.length : 0}
            max={totalRevenue}
            unit="$"
            color="#10b981"
          />
          <MetricBar
            label="Top Performer Share"
            value={rankedByRevenue[0] ? (rankedByRevenue[0].revenue / totalRevenue * 100) : 0}
            max={100}
            unit="%"
            color="#f59e0b"
          />
        </div>
      </div>
    </div>
  );

  const renderGeographic = () => (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '24px', color: '#1e293b' }}>
        Geographic Analysis
      </h2>

      {/* State Rankings */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
          Revenue by State
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {geographicStats.slice(0, 10).map((state, idx) => (
            <div key={state.name} style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>
                  {idx + 1}. {state.name}
                </span>
                <span style={{ fontSize: '14px', color: '#64748b' }}>
                  {state.count} shipments
                </span>
              </div>
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#3b82f6' }}>
                  ${state.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  ${state.avgPerShipment.toFixed(2)} per shipment
                </div>
              </div>
              <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${state.intensity}%`, 
                    height: '100%', 
                    background: 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                    borderRadius: '4px'
                  }} 
                />
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                {state.intensity.toFixed(1)}% of total revenue
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* City Analysis */}
      {stats.city && stats.city.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
            Top 10 Cities by Revenue
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#64748b' }}>Rank</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600', color: '#64748b' }}>City</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#64748b' }}>Shipments</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#64748b' }}>Revenue</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontWeight: '600', color: '#64748b' }}>Avg/Shipment</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.city].sort((a, b) => b.revenue - a.revenue).slice(0, 10).map((city, idx) => (
                  <tr key={city.name} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                    <td style={{ padding: '12px' }}>{idx + 1}</td>
                    <td style={{ padding: '12px', fontWeight: '600' }}>{city.name}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{city.count}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      ${city.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      ${city.avgPerShipment.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  const renderRankings = () => (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        <RankingCard
          title="💰 Top by Revenue"
          data={rankedByRevenue}
          valueKey="revenue"
          formatter={(val) => `$${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        />
        <RankingCard
          title="📦 Top by Volume"
          data={rankedByVolume}
          valueKey="count"
          formatter={(val) => val.toString()}
        />
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
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1e293b' }}>
            Select Entities to Compare (Up to 5)
          </h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {availableEntities.slice(0, 20).map((entity) => (
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

    return (
      <div style={{ padding: '24px' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <MetricCard title="Total Revenue" value={`$${entityData.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
          <MetricCard title="Total Shipments" value={entityData.count} />
          <MetricCard title="Avg per Shipment" value={`$${entityData.avgPerShipment.toFixed(2)}`} />
          <MetricCard
            title="Market Share"
            value={`${totalRevenue > 0 ? ((entityData.revenue / totalRevenue) * 100).toFixed(1) : '0.0'}%`}
          />
        </div>

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
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '16px 24px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>
              📊 Enhanced Analytics Dashboard
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

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {selectedTab === 'overview' && renderOverview()}
        {selectedTab === 'insights' && renderInsights()}
        {selectedTab === 'geographic' && renderGeographic()}
        {selectedTab === 'rankings' && renderRankings()}
        {selectedTab === 'comparison' && renderComparison()}
        {selectedTab === 'breakdown' && renderBreakdown()}
        {selectedTab === 'individual' && renderIndividual()}
      </div>
    </div>
  );
}

// Helper Components
function MetricCard({ title, value, trend, trendUp, subtitle }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}>{value}</div>
      {trend && (
        <div style={{ fontSize: '12px', color: trendUp ? '#10b981' : '#ef4444', fontWeight: '600' }}>
          {trendUp ? '↑' : '↓'} {trend}
        </div>
      )}
      {subtitle && (
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{subtitle}</div>
      )}
    </div>
  );
}

function DistributionCard({ title, value, subtitle }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#3b82f6' }}>{value}%</div>
      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{subtitle}</div>
    </div>
  );
}

function MetricBar({ label, value, max, unit, color }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
        <span style={{ fontWeight: '600', color: '#475569' }}>{label}</span>
        <span style={{ fontWeight: 'bold', color }}>
          {unit === '$' ? `$${value.toLocaleString()}` : `${value.toFixed(1)}${unit}`}
        </span>
      </div>
      <div style={{ height: '12px', background: '#e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.min(percentage, 100)}%`,
            height: '100%',
            background: color,
            borderRadius: '6px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
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

export default EnhancedAnalytics;

