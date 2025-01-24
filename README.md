# Getting Started

In the terminal run

1. `npm install` in the terminal
2. Create a `.env` based on the template and provide an API key
3. run `npm run dev` in the terminal
4. use postman to send requests eg to `http://localhost:3000/generate`

## Sending Requests

A. Configure the Request
Create a New Request in Postman:

Name: Process Unmapped Accounts
Method: POST
URL: http://localhost:3000/process-accounts
Set Headers:

Key: Content-Type
Value: application/json
Set Body:

Type: raw

Format: JSON

Example Body:

json
Copy
{
"unmappedAccountsData": [
{
"accountNumber": "6340",
"accountName": "Lighting"
},
{
"accountNumber": "6345",
"accountName": "Heating"
},
{
"accountNumber": "6360",
"accountName": "Cleaning"
},
{
"accountNumber": "6391",
"accountName": "Joint/administrative cost, shopping centre merchants association"
},
{
"accountNumber": "6399",
"accountName": "Other costs related to premises"
},
{
"accountNumber": "6400",
"accountName": "Rental of machinery"
},
{
"accountNumber": "6410",
"accountName": "Rental of fixtures and fittings"
},
{
"accountNumber": "6420",
"accountName": "Rental of computer systems"
},
{
"accountNumber": "6430",
"accountName": "Rental of other office machines"
},
{
"accountNumber": "6440",
"accountName": "Rental of means of transport"
},
{
"accountNumber": "6490",
"accountName": "Other rental costs"
},
{
"accountNumber": "6500",
"accountName": "Motorised tools"
},
{
"accountNumber": "6510",
"accountName": "Hand tools"
},
{
"accountNumber": "6520",
"accountName": "Auxiliary tools"
},
{
"accountNumber": "6530",
"accountName": "Special tools"
},
{
"accountNumber": "6540",
"accountName": "Fixtures and fittings"
},
{
"accountNumber": "6551",
"accountName": "Computer equipment"
},
{
"accountNumber": "6552",
"accountName": "Software, procurement"
},
{
"accountNumber": "6553",
"accountName": "Software, annual maintenance"
},
{
"accountNumber": "6560",
"accountName": "Supplies"
},
{
"accountNumber": "6570",
"accountName": "Work clothing, reportable"
},
{
"accountNumber": "6571",
"accountName": "Work clothing, non-reportable"
},
{
"accountNumber": "6575",
"accountName": "Protective gear"
},
{
"accountNumber": "6590",
"accountName": "Other operating materials"
},
{
"accountNumber": "6600",
"accountName": "Repair and maintenance of buildings"
},
{
"accountNumber": "6620",
"accountName": "Repair and maintenance of equipment"
},
{
"accountNumber": "6690",
"accountName": "Other repair and maintenance"
},
{
"accountNumber": "6700",
"accountName": "Auditors remuneration"
},
{
"accountNumber": "6702",
"accountName": "Auditors remuneration for other services"
},
{
"accountNumber": "6705",
"accountName": "Accountant fees"
},
{
"accountNumber": "6706",
"accountName": "Fees for other services from accountants"
},
{
"accountNumber": "6720",
"accountName": "Fees for other financial advising"
},
{
"accountNumber": "6725",
"accountName": "Fees for legal services, deductible"
},
{
"accountNumber": "6726",
"accountName": "Fees for legal services, non-deductible"
},
{
"accountNumber": "6750",
"accountName": "Fees for computer services"
},
{
"accountNumber": "6790",
"accountName": "Other external services, reportable"
},
{
"accountNumber": "6795",
"accountName": "Other external services, non-reportable"
},
{
"accountNumber": "6800",
"accountName": "Office supplies"
},
{
"accountNumber": "6820",
"accountName": "Printed matter"
},
{
"accountNumber": "6840",
"accountName": "Newspapers, journals/periodicals, books etc."
},
{
"accountNumber": "6860",
"accountName": "Meetings, seminars/courses, refresher courses etc."
},
{
"accountNumber": "6890",
"accountName": "Other office costs"
},
{
"accountNumber": "6900",
"accountName": "Telephone"
},
{
"accountNumber": "6903",
"accountName": "Mobile telephone"
},
{
"accountNumber": "6907",
"accountName": "Data communication"
},
{
"accountNumber": "6909",
"accountName": "Other telecommunication"
},
{
"accountNumber": "6940",
"accountName": "Postage"
},
{
"accountNumber": "7000",
"accountName": "Fuel, means of transport 1"
}
]
}
B. Send the Request
Click "Send":

Postman will execute the request and display the response.
Review the Response:

Success Example:

json
Copy
{
"message": "Accounts processed successfully.",
"outputPath": "/path/to/your-project/results/processed_accounts_1634567890123.csv"
}
Failure Example:

json
Copy
{
"error": "Failed to process accounts."
}
Check Logs: Review combined.log for detailed error messages.

C. Retrieve the Processed CSV
Locate the CSV File:

Navigate to the results directory.
Find the CSV file named similar to processed_accounts_1634567890123.csv.
Open and Review:

Use a spreadsheet application to open and verify the data.
