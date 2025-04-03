import React, { useState, useEffect } from 'react';
import './OptionPage.css'; // Assuming you might want some basic styling

const OptionPage = () => {
    const [optionSales, setOptionSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchOptionSales = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/option-sales');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                // Assuming the API returns an object with an "OptionSaleDetails" array
                setOptionSales(data.OptionSaleDetails || []);
                setError(null);
            } catch (e) {
                console.error("Error fetching option sales:", e);
                // Attempt to log the raw response text for debugging
                if (e instanceof SyntaxError && e.message.includes('JSON.parse')) {
                    try {
                        // Re-fetch or access the response text if possible (depends on how response was handled)
                        // A simpler approach for now: log the error and indicate it's a parsing issue.
                        // For more robust logging, you might need to adjust the initial fetch logic
                        // to read the response as text first if the status indicates an error or if JSON parsing fails.
                        const response = await fetch('/api/option-sales'); // Re-fetch to get text - might not be ideal
                        const text = await response.text();
                        console.error("Raw response text:", text);
                        setError(`Failed to parse option sales data. Server responded with: ${text.substring(0, 100)}...`);
                    } catch (textError) {
                        console.error("Could not get raw response text:", textError);
                        setError("Failed to load option sales data (JSON parsing error).");
                    }
                } else {
                    setError("Failed to load option sales data.");
                }
                setOptionSales([]); // Clear data on error
            } finally {
                setLoading(false);
            }
        };

        fetchOptionSales();
    }, []); // Empty dependency array means this effect runs once on mount

    if (loading) {
        return <div>Loading option sales data...</div>;
    }

    if (error) {
        return <div style={{ color: 'red' }}>{error}</div>;
    }

    return (
        <div className="option-page-container">
            <h1>Option Sales</h1>
            {optionSales.length === 0 ? (
                <p>No option sales data available.</p>
            ) : (
                <table className="option-sales-table">
                    <thead>
                        <tr>
                            <th>Open Date</th>
                            <th>Close Date</th>
                            <th>Product Name</th>
                            <th>Quantity</th>
                            <th>Open Price</th>
                            <th>Open Amount ({optionSales[0]?.open_currency})</th>
                            <th>Close Price</th>
                            <th>Close Amount ({optionSales[0]?.close_currency})</th>
                            <th>Commission</th>
                            <th>Delta</th>
                            <th>Country</th>
                        </tr>
                    </thead>
                    <tbody>
                        {optionSales.map((sale, index) => (
                            <tr key={sale.open_order_id || sale.close_order_id || index}> {/* Use a stable key */}
                                <td>{sale.open_date}</td>
                                <td>{sale.close_date || 'N/A'}</td>
                                <td>{sale.product_name}</td>
                                <td>{sale.quantity}</td>
                                <td>{sale.open_price?.toFixed(2)}</td>
                                <td>{sale.open_amount_eur?.toFixed(2)}</td>
                                <td>{sale.close_price?.toFixed(2)}</td>
                                <td>{sale.close_amount_eur?.toFixed(2)}</td>
                                <td>{sale.commission?.toFixed(2)}</td>
                                <td>{sale.delta?.toFixed(2)}</td>
                                <td>{sale.country_code}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default OptionPage;
