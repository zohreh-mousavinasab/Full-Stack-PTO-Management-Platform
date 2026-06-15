Feature: PTO Request Creation

  Scenario: Employee submits a valid PTO request
    Given the employee has enough balance for the selected PTO type
    And the selected dates include at least one working day
    When the employee submits a request with a valid date range
    Then the request is created with pending status
    And the pending balance is increased
    And a notification is sent to the manager or requester
    And an audit log entry is created

  Scenario: PTO request is rejected when end date is before start date
    Given the employee is on the request form
    When the employee submits an end date earlier than the start date
    Then the API returns a 400 response
    And the request is not created

  Scenario: PTO request is rejected when no working days are selected
    Given the employee selects only weekend dates or holiday-only dates
    When the employee submits the request
    Then the API returns a 400 response
    And the response explains that the selected range contains no working days

  Scenario: PTO request is rejected when balance is insufficient
    Given the employee does not have enough available balance for a paid PTO type
    When the employee submits the request
    Then the API returns a 400 response
    And the request is not stored

  Scenario: Unpaid leave can be submitted without available balance
    Given the employee selects unpaid leave
    And the date range contains working days
    When the employee submits the request
    Then the request is created successfully

  Scenario: Conflict is detected for overlapping leave
    Given another pending or approved request overlaps the selected dates
    When the employee submits a new request for the same team or user context
    Then the request is marked as conflicting
    And conflict notifications are created for the employee and manager when applicable
