Feature: Balances

  Scenario: User can view balances by PTO type
    Given the dashboard is loaded
    When balance cards are rendered
    Then each balance shows available, accrued year-to-date, and pending values

  Scenario: Admin can adjust a balance upward
    Given an admin selects a user and PTO type
    When the admin submits a positive adjustment
    Then the balance increases
    And an audit log records the adjustment reason and amount

  Scenario: Admin cannot reduce a balance below zero
    Given a balance exists for a user
    When an adjustment would reduce the balance below zero
    Then the system clamps the result at zero
    And the balance does not become negative
