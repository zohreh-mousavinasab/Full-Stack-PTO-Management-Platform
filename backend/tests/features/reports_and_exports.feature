Feature: Reports and Exports

  Scenario: Usage report shows approved days by PTO type
    Given approved PTO requests exist
    When the usage report loads
    Then the report shows totals per PTO type

  Scenario: Balance report shows available and pending values
    Given balances exist in the database
    When the balances report loads
    Then the report lists each user and PTO type with current values

  Scenario: Approval report shows counts by status
    Given requests exist in multiple statuses
    When the approvals report loads
    Then the report shows pending, approved, rejected, and cancelled counts

  Scenario: User can download usage CSV
    Given usage data exists
    When the user downloads the usage export
    Then the response has CSV content type
    And the file includes a header row and usage rows

  Scenario: User can download balances CSV
    Given balance data exists
    When the user downloads the balances export
    Then the CSV includes user, PTO type, available, and pending columns

  Scenario: Unknown export returns not found
    Given an unsupported export name is requested
    When the export endpoint is called
    Then the API returns a 404 response
