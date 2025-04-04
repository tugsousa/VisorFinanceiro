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

    const calculateDaysHeld = (openDateStr, closeDateStr) => {
        if (!openDateStr || !closeDateStr) {
            return 'N/A'; // Return N/A if either date is missing
        }

        // Helper function to parse potentially ambiguous date strings
        const parseDate = (dateStr) => {
            if (!dateStr) return new Date(NaN); // Handle null/undefined input

            const trimmedDateStr = dateStr.trim(); // Trim whitespace
            let parsedDate = new Date(NaN); // Initialize as invalid

            // 1. Try parsing 'DD-MM-YYYY HH:MM:SS' format
            let parts = trimmedDateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
            if (parts) {
                const day = parseInt(parts[1]);
                const month = parseInt(parts[2]) - 1; // Adjust month index
                const year = parseInt(parts[3]);
                const hour = parseInt(parts[4]);
                const minute = parseInt(parts[5]);
                const second = parseInt(parts[6]);
                if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59) {
                    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
                    if (!isNaN(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
                        console.log(`Parsed "${trimmedDateStr}" using DD-MM-YYYY HH:MM:SS ->`, date.toISOString());
                        return date;
                    }
                }
            }

            // 2. Try parsing 'DD-MM-YYYY' format
            parts = trimmedDateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
            if (parts) {
                const day = parseInt(parts[1]);
                const month = parseInt(parts[2]) - 1; // Adjust month index
                const year = parseInt(parts[3]);
                if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
                   const date = new Date(Date.UTC(year, month, day));
                   if (!isNaN(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) {
                       console.log(`Parsed "${trimmedDateStr}" using DD-MM-YYYY ->`, date.toISOString());
                       return date;
                   }
                }
            }

            // 3. Try parsing 'YYYY-MM-DD HH:MM:SS' format
            parts = trimmedDateStr.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
            if (parts) {
                const date = new Date(Date.UTC(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]), parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6])));
                if (!isNaN(date.getTime())) {
                    console.log(`Parsed "${trimmedDateStr}" using YYYY-MM-DD HH:MM:SS ->`, date.toISOString());
                    return date;
                }
            }

            // 4. Try direct parsing (handles ISO 8601, RFC 2822, etc., as a fallback)
            parsedDate = new Date(trimmedDateStr);
            if (!isNaN(parsedDate.getTime())) {
                 console.log(`Parsed "${trimmedDateStr}" using direct new Date() ->`, parsedDate.toISOString());
                return parsedDate;
            }

            // 5. If all parsing attempts fail, return an invalid date object
            console.warn(`Failed to parse date string: "${dateStr}" (trimmed: "${trimmedDateStr}")`);
            return new Date(NaN);
        };

        try {
            const openDate = parseDate(openDateStr);
            const closeDate = parseDate(closeDateStr);

            // Check if dates are valid after parsing attempts
            if (isNaN(openDate.getTime()) || isNaN(closeDate.getTime())) {
                console.error("Could not parse dates for calculation:", openDateStr, closeDateStr);
                return 'Invalid Date'; // Return 'Invalid Date' if parsing failed
             }

             // Ensure closeDate is not before openDate (can happen with data entry errors)
             console.log("Comparing dates:", { openDateStr, openDate: openDate?.toISOString(), closeDateStr, closeDate: closeDate?.toISOString() }); // Log ISO strings for clarity
             if (closeDate < openDate) {
                 console.warn("Close date is before open date:", openDateStr, closeDateStr);
                 return 'Check Dates'; // Or handle as appropriate
            }

            const differenceInTime = closeDate.getTime() - openDate.getTime();
            const differenceInDays = Math.round(differenceInTime / (1000 * 3600 * 24)); // Convert ms to days
            return differenceInDays;
        } catch (error) {
            console.error("Error calculating days held:", error);
            return 'Error';
        }
    };


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
                            <th>Days Held</th>
                            <th>Product Name</th>
                            <th>Quantity</th>
                            <th>Open Price</th>
                            <th>Close Price</th>
                            <th>Open Amount ({optionSales[0]?.open_currency})</th>
                            <th>Close Amount ({optionSales[0]?.close_currency})</th>
                            <th>Commission</th>
                            <th>Delta</th>
                        </tr>
                    </thead>
                    <tbody>
                        {optionSales.map((sale, index) => (
                            <tr key={sale.open_order_id || sale.close_order_id || index}> {/* Use a stable key */}
                                <td>{sale.open_date}</td>
                                <td>{sale.close_date || 'N/A'}</td>
                                <td>{calculateDaysHeld(sale.open_date, sale.close_date)}</td>
                                <td>{sale.product_name}</td>
                                <td>{sale.quantity}</td>
                                <td>{sale.open_price?.toFixed(2)}</td>
                                <td>{sale.close_price?.toFixed(2)}</td>
                                <td>{sale.open_amount_eur?.toFixed(2)}</td>
                                <td>{sale.close_amount_eur?.toFixed(2)}</td>
                                <td>{sale.commission?.toFixed(2)}</td>
                                <td>{sale.delta?.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default OptionPage;
